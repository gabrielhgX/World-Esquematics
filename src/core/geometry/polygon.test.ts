import { describe, expect, it } from 'vitest';
import { pointInPolygon, simplifyIndices, simplifyPolyline, type PolygonRing } from './polygon';

const square: PolygonRing = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

describe('pointInPolygon', () => {
  it('dentro/fora de um quadrado', () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
    expect(pointInPolygon(15, 5, square)).toBe(false);
    expect(pointInPolygon(-1, -1, square)).toBe(false);
  });

  it('funciona em polígono côncavo (L)', () => {
    const L: PolygonRing = [
      [0, 0],
      [10, 0],
      [10, 4],
      [4, 4],
      [4, 10],
      [0, 10],
    ];
    expect(pointInPolygon(2, 8, L)).toBe(true); // braço vertical
    expect(pointInPolygon(8, 2, L)).toBe(true); // braço horizontal
    expect(pointInPolygon(8, 8, L)).toBe(false); // reentrância
  });
});

describe('simplify (Douglas-Peucker)', () => {
  it('remove pontos colineares e preserva cantos', () => {
    const points: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [3, 1],
      [3, 2],
      [3, 3],
    ];
    const simplified = simplifyPolyline(points, 0.01);
    expect(simplified).toEqual([
      [0, 0],
      [3, 0],
      [3, 3],
    ]);
  });

  it('mantém desvios acima da tolerância', () => {
    const points: Array<[number, number]> = [
      [0, 0],
      [5, 2],
      [10, 0],
    ];
    expect(simplifyPolyline(points, 1).length).toBe(3);
    expect(simplifyPolyline(points, 3).length).toBe(2);
  });

  it('simplifyIndices devolve índices crescentes com extremos', () => {
    const points: Array<[number, number]> = [
      [0, 0],
      [1, 0.001],
      [2, 0],
      [3, 5],
      [4, 0],
    ];
    const kept = simplifyIndices(points, 0.5);
    expect(kept[0]).toBe(0);
    expect(kept[kept.length - 1]).toBe(4);
    expect(kept).toContain(3);
  });
});
