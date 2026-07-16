import { describe, expect, it } from 'vitest';
import {
  U16_MAX,
  cellToWorld,
  heightToU16,
  sampleBilinear,
  u16ToHeight,
  verticalPrecision_m,
  worldToCell,
} from './conversions';

// heightRange do exemplo do README §1: -200 m .. 1800 m
const range = { min_m: -200, max_m: 1800 };

describe('conversões metro ↔ célula ↔ uint16 (README §1.2)', () => {
  it('mundo → célula (floor) e célula → mundo (canto)', () => {
    expect(worldToCell(0, 4)).toBe(0);
    expect(worldToCell(3.99, 4)).toBe(0);
    expect(worldToCell(4, 4)).toBe(1);
    expect(worldToCell(-0.1, 4)).toBe(-1);
    expect(cellToWorld(1000, 4)).toBe(4000);
    expect(cellToWorld(0, 4)).toBe(0);
  });

  it('altura ↔ uint16 nos extremos do range', () => {
    expect(heightToU16(range.min_m, range)).toBe(0);
    expect(heightToU16(range.max_m, range)).toBe(U16_MAX);
    expect(u16ToHeight(0, range)).toBe(range.min_m);
    expect(u16ToHeight(U16_MAX, range)).toBe(range.max_m);
  });

  it('altura fora do range faz clamp', () => {
    expect(heightToU16(-9999, range)).toBe(0);
    expect(heightToU16(9999, range)).toBe(U16_MAX);
  });

  it('round-trip com erro ≤ metade da precisão vertical', () => {
    const halfPrecision = verticalPrecision_m(range) / 2;
    for (const h of [-200, -12.34, 0, 250.5, 999.99, 1800]) {
      const roundTrip = u16ToHeight(heightToU16(h, range), range);
      expect(Math.abs(roundTrip - h)).toBeLessThanOrEqual(halfPrecision + 1e-9);
    }
  });

  it('precisão vertical do exemplo do README ≈ 3.05 cm', () => {
    expect(verticalPrecision_m(range)).toBeCloseTo(0.0305, 3);
  });

  it('bilinear: exata nos cantos, média no centro, meio nas arestas', () => {
    const values: Record<string, number> = { '0,0': 0, '1,0': 10, '0,1': 20, '1,1': 30 };
    const sample = (cx: number, cy: number) => values[`${cx},${cy}`] ?? 0;
    const res = 4;

    expect(sampleBilinear(sample, 0, 0, res)).toBe(0); // canto (0,0)
    expect(sampleBilinear(sample, 2, 0, res)).toBe(5); // meio da aresta inferior
    expect(sampleBilinear(sample, 0, 2, res)).toBe(10); // meio da aresta esquerda
    expect(sampleBilinear(sample, 2, 2, res)).toBe(15); // centro = média dos 4
  });
});
