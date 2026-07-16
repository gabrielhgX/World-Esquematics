import { describe, expect, it } from 'vitest';
import { crc32, writeZip } from './zip';

const text = (s: string) => new TextEncoder().encode(s);

describe('crc32', () => {
  it('vetor de teste clássico: "123456789" → 0xCBF43926', () => {
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
  });

  it('vazio → 0', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('writeZip (container dos exportadores e do .wmap — README §8/§9)', () => {
  it('estrutura válida: headers locais, diretório central e EOCD', () => {
    const zip = writeZip([
      { path: 'a.txt', data: text('hello') },
      { path: 'dir/b.bin', data: new Uint8Array([1, 2, 3]) },
    ]);
    const view = new DataView(zip.buffer);

    // header local da primeira entrada
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    // EOCD nos últimos 22 bytes
    const eocd = zip.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 8, true)).toBe(2); // entradas
    expect(view.getUint16(eocd + 10, true)).toBe(2);

    // diretório central onde o EOCD aponta
    const cdOffset = view.getUint32(eocd + 16, true);
    expect(view.getUint32(cdOffset, true)).toBe(0x02014b50);

    // nomes e conteúdo presentes (stored = bytes crus)
    const raw = new TextDecoder('latin1').decode(zip);
    expect(raw).toContain('a.txt');
    expect(raw).toContain('dir/b.bin');
    expect(raw).toContain('hello');
  });

  it('CRC e tamanhos corretos no header local', () => {
    const data = text('hello');
    const zip = writeZip([{ path: 'a.txt', data }]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(14, true)).toBe(crc32(data));
    expect(view.getUint32(18, true)).toBe(5); // comprimido (stored = igual)
    expect(view.getUint32(22, true)).toBe(5); // original
  });
});
