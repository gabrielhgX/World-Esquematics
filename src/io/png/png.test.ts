import { describe, expect, it } from 'vitest';
import { encodeGrayPng8 } from './png';
import { decodeGrayPng8 } from './pngTestUtils';

describe('encodeGrayPng8 (weightmaps de bioma — §9.1)', () => {
  it('round-trip: gradiente 16×4 volta pixel a pixel', async () => {
    const width = 16;
    const height = 4;
    const pixels = new Uint8Array(width * height);
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 7) % 256;

    const png = await encodeGrayPng8(pixels, width, height);
    const decoded = await decodeGrayPng8(png);
    expect(decoded.width).toBe(width);
    expect(decoded.height).toBe(height);
    expect([...decoded.pixels]).toEqual([...pixels]);
  });

  it('imagem constante comprime bem (zlib agiu)', async () => {
    const pixels = new Uint8Array(256 * 256).fill(200);
    const png = await encodeGrayPng8(pixels, 256, 256);
    expect(png.length).toBeLessThan(2000);
  });

  it('rejeita dimensões inconsistentes', async () => {
    await expect(encodeGrayPng8(new Uint8Array(10), 4, 4)).rejects.toThrow(/esperado/);
  });
});
