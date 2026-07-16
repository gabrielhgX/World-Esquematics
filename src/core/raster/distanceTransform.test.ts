import { describe, expect, it } from 'vitest';
import { distanceToMask } from './distanceTransform';

const at = (d: Float32Array, w: number, x: number, y: number) => d[y * w + x];

describe('distanceToMask (EDT Felzenszwalb–Huttenlocher)', () => {
  it('ponto único: distância euclidiana exata em todo o grid', () => {
    const w = 9;
    const h = 7;
    const mask = new Uint8Array(w * h);
    mask[3 * w + 4] = 1; // (4,3)
    const d = distanceToMask(mask, w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        expect(at(d, w, x, y)).toBeCloseTo(Math.hypot(x - 4, y - 3), 5);
      }
    }
  });

  it('faixa vertical: distância horizontal até a coluna mais próxima', () => {
    const w = 8;
    const h = 4;
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) mask[y * w + 2] = 1; // coluna x=2
    const d = distanceToMask(mask, w, h);
    expect(at(d, w, 2, 1)).toBe(0);
    expect(at(d, w, 0, 3)).toBe(2);
    expect(at(d, w, 7, 0)).toBe(5);
  });

  it('máscara vazia: tudo vira "sem alvo" (valor enorme)', () => {
    const d = distanceToMask(new Uint8Array(6), 3, 2);
    for (const value of d) expect(value).toBeGreaterThan(1e9);
  });

  it('confere com força bruta num grid aleatório', () => {
    const w = 17;
    const h = 13;
    const mask = new Uint8Array(w * h);
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const ones: Array<[number, number]> = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (rand() < 0.1) {
          mask[y * w + x] = 1;
          ones.push([x, y]);
        }
      }
    }
    const d = distanceToMask(mask, w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const brute = Math.min(...ones.map(([ox, oy]) => Math.hypot(x - ox, y - oy)));
        expect(at(d, w, x, y)).toBeCloseTo(brute, 4);
      }
    }
  });
});
