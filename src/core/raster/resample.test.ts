import { describe, expect, it } from 'vitest';
import { resampleBicubicU16 } from './resample';
import { TiledRaster } from './TiledRaster';

describe('resampleBicubicU16 (README §9.1, gotcha #1)', () => {
  it('mesmo tamanho preserva os valores', () => {
    const src = Uint16Array.from({ length: 16 }, (_, i) => i * 100);
    expect(resampleBicubicU16(src, 4, 4, 4, 4)).toEqual(src);
  });

  it('preserva os cantos ao mudar de tamanho', () => {
    const src = new Uint16Array(4 * 4);
    src[0] = 1000; // (0,0)
    src[3] = 2000; // (3,0)
    src[12] = 3000; // (0,3)
    src[15] = 4000; // (3,3)
    const out = resampleBicubicU16(src, 4, 4, 7, 7);
    expect(out[0]).toBe(1000);
    expect(out[6]).toBe(2000);
    expect(out[42]).toBe(3000);
    expect(out[48]).toBe(4000);
  });

  it('Catmull-Rom reproduz rampas lineares exatamente no interior', () => {
    // h(x) = 100·x num grid 9×3 → reamostrado para 17×3 continua linear.
    // Bordas usam clamp-to-edge: exatidão garantida fora da 1ª/última janela.
    const src = new Uint16Array(9 * 3);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 9; x++) src[y * 9 + x] = x * 100;
    const out = resampleBicubicU16(src, 9, 3, 17, 3);
    for (let x = 2; x <= 14; x++) {
      expect(out[17 + x]).toBe(x * 50); // linha do meio: passo vira 50
    }
    // cantos exatos e monotonicidade preservada mesmo na borda
    expect(out[17]).toBe(0);
    expect(out[17 + 16]).toBe(800);
    for (let x = 1; x < 17; x++) {
      expect(out[17 + x]).toBeGreaterThanOrEqual(out[17 + x - 1]);
    }
  });

  it('clampa em 0..65535 (overshoot do bicúbico em degraus)', () => {
    const src = new Uint16Array(8 * 1);
    src.set([0, 0, 0, 0, 65535, 65535, 65535, 65535]);
    const out = resampleBicubicU16(src, 8, 1, 32, 1);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(65535);
    }
  });

  it('rejeita dimensões inconsistentes', () => {
    expect(() => resampleBicubicU16(new Uint16Array(10), 4, 4, 8, 8)).toThrow(/esperado 16/);
  });
});

describe('TiledRaster.toDense', () => {
  it('materializa tiles esparsos com fillValue nos ausentes', () => {
    const raster = new TiledRaster<Uint16Array>({
      widthCells: 100,
      heightCells: 80,
      tileSize: 64,
      fillValue: 7,
      createTile: (n) => new Uint16Array(n),
    });
    raster.set(0, 0, 11); // tile (0,0)
    raster.set(99, 79, 22); // tile (1,1), na borda cortada

    const dense = raster.toDense((n) => new Uint16Array(n));
    expect(dense.length).toBe(100 * 80);
    expect(dense[0]).toBe(11);
    expect(dense[79 * 100 + 99]).toBe(22);
    expect(dense[40 * 100 + 50]).toBe(7); // região sem tile
  });
});
