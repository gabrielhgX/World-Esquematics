import { crc32 } from '../format/zip';

/**
 * Encoder PNG mínimo para os weightmaps de bioma (README §9.1: "1 PNG 8-bit
 * por bioma"). Grayscale 8-bit, sem paleta, filtro 0 em todas as linhas;
 * IDAT comprimido em zlib via CompressionStream('deflate').
 *
 * Só ESCRITA — o editor nunca lê PNG (o .wmap guarda binário cru).
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export async function encodeGrayPng8(
  pixels: Uint8Array,
  width: number,
  height: number,
): Promise<Uint8Array> {
  if (pixels.length !== width * height) {
    throw new RangeError(`${pixels.length} pixels; esperado ${width * height}.`);
  }

  // scanlines com o byte de filtro 0 na frente de cada linha
  const raw = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y++) {
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  const idat = await deflateZlib(raw);

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // color type: grayscale
  // compression 0, filter 0, interlace 0

  const chunks = [
    new Uint8Array(PNG_SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of chunks) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** length + type + data + CRC32(type+data) — o formato de chunk do PNG. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function deflateZlib(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(
    new CompressionStream('deflate'), // 'deflate' = formato zlib (RFC 1950)
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
