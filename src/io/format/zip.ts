/**
 * Escritor de ZIP sem dependências (entradas STORED, sem compressão).
 *
 * Usado pelos exportadores (README §9) e base do formato .wmap (README §8),
 * que também é um container ZIP. Deflate entra na Fase 5 (save incremental)
 * via CompressionStream, atrás desta mesma API.
 */

export interface ZipEntry {
  path: string;
  data: Uint8Array;
}

/** CRC-32 (polinômio refletido 0xEDB88320), tabela calculada uma vez. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Data/hora DOS fixa (1980-01-01) — saída determinística, bom para testes.
const DOS_TIME = 0;
const DOS_DATE = 0x21;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

interface ZipRecord {
  name: Uint8Array;
  method: number;
  crc: number;
  compressed: Uint8Array;
  uncompressedSize: number;
}

/** ZIP com todas as entradas STORED (síncrono — exportadores). */
export function writeZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  return assembleZip(
    entries.map((entry) => ({
      name: encoder.encode(entry.path),
      method: METHOD_STORED,
      crc: crc32(entry.data),
      compressed: entry.data,
      uncompressedSize: entry.data.length,
    })),
  );
}

/**
 * ZIP com DEFLATE por entrada (README §8: "deflate do zip") — usado pelo
 * .wmap. Entradas .png ficam stored (já são comprimidas).
 */
export async function writeZipCompressed(entries: ZipEntry[]): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const records: ZipRecord[] = [];
  for (const entry of entries) {
    const store = entry.path.endsWith('.png');
    records.push({
      name: encoder.encode(entry.path),
      method: store ? METHOD_STORED : METHOD_DEFLATE,
      crc: crc32(entry.data),
      compressed: store ? entry.data : await deflateRaw(entry.data),
      uncompressedSize: entry.data.length,
    });
  }
  return assembleZip(records);
}

/** Lê um ZIP (métodos stored e deflate), validando CRC-32. */
export async function readZip(bytes: Uint8Array): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // EOCD: varre de trás para frente (comentário do zip pode deslocá-lo)
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('Arquivo não é um ZIP válido (EOCD ausente).');

  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error('Diretório central corrompido.');
    }
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const path = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));

    // header local tem name/extra próprios — os dados vêm depois deles
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);

    let data: Uint8Array;
    if (method === METHOD_STORED) data = raw.slice();
    else if (method === METHOD_DEFLATE) data = await inflateRaw(raw);
    else throw new Error(`Método de compressão não suportado: ${method} (${path})`);

    if (crc32(data) !== crc) throw new Error(`CRC inválido em ${path} — arquivo corrompido.`);
    entries.push({ path, data });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function assembleZip(records: ZipRecord[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const record of records) {
    const { name, method, crc, compressed, uncompressedSize } = record;
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // assinatura local
    lv.setUint16(4, 20, true); // versão mínima
    lv.setUint16(6, 0x0800, true); // flag: nomes em UTF-8
    lv.setUint16(8, method, true);
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressed.length, true);
    lv.setUint32(22, uncompressedSize, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    parts.push(local, compressed);

    const dir = new Uint8Array(46 + name.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true); // assinatura do diretório central
    dv.setUint16(4, 20, true); // feito por
    dv.setUint16(6, 20, true); // versão mínima
    dv.setUint16(8, 0x0800, true);
    dv.setUint16(10, method, true);
    dv.setUint16(12, DOS_TIME, true);
    dv.setUint16(14, DOS_DATE, true);
    dv.setUint32(16, crc, true);
    dv.setUint32(20, compressed.length, true);
    dv.setUint32(24, uncompressedSize, true);
    dv.setUint16(28, name.length, true);
    dv.setUint32(42, offset, true); // offset do header local
    dir.set(name, 46);
    central.push(dir);

    offset += local.length + compressed.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // assinatura EOCD
  ev.setUint16(8, records.length, true);
  ev.setUint16(10, records.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...parts, ...central, eocd]) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  return pipeThrough(data, new CompressionStream('deflate-raw'));
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  return pipeThrough(data, new DecompressionStream('deflate-raw'));
}

async function pipeThrough(
  data: Uint8Array,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
