import { describe, expect, it } from 'vitest';
import {
  cubicIntersections,
  evalCubic,
  flattenCubic,
  lineAsCubic,
  splitCubic,
  splitCubicAt,
  type Cubic,
} from './bezier';

const curve: Cubic = {
  p0: { x: 0, y: 0 },
  c1: { x: 100, y: 200 },
  c2: { x: 300, y: 200 },
  p1: { x: 400, y: 0 },
};

describe('Bézier cúbica (README §4.5, item 17)', () => {
  it('evalCubic nas extremidades devolve os endpoints', () => {
    expect(evalCubic(curve, 0)).toEqual(curve.p0);
    expect(evalCubic(curve, 1)).toEqual(curve.p1);
  });

  it('splitCubic reproduz a curva original exatamente', () => {
    const [head, tail] = splitCubic(curve, 0.3);
    for (const t of [0.1, 0.25]) {
      const direct = evalCubic(curve, t);
      const viaHead = evalCubic(head, t / 0.3);
      expect(viaHead.x).toBeCloseTo(direct.x, 9);
      expect(viaHead.y).toBeCloseTo(direct.y, 9);
    }
    const direct = evalCubic(curve, 0.7);
    const viaTail = evalCubic(tail, (0.7 - 0.3) / 0.7);
    expect(viaTail.x).toBeCloseTo(direct.x, 9);
    expect(viaTail.y).toBeCloseTo(direct.y, 9);
  });

  it('splitCubicAt em vários t preserva a cadeia de endpoints', () => {
    const pieces = splitCubicAt(curve, [0.25, 0.5, 0.75]);
    expect(pieces.length).toBe(4);
    for (let i = 1; i < pieces.length; i++) {
      expect(pieces[i].p0.x).toBeCloseTo(pieces[i - 1].p1.x, 9);
      expect(pieces[i].p0.y).toBeCloseTo(pieces[i - 1].p1.y, 9);
    }
    const mid = evalCubic(curve, 0.5);
    expect(pieces[1].p1.x).toBeCloseTo(mid.x, 9);
    expect(pieces[1].p1.y).toBeCloseTo(mid.y, 9);
  });

  it('flatten adaptativo: reta vira 2 pontos; curva respeita a tolerância', () => {
    const line = lineAsCubic({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(flattenCubic(line, 0.5).points.length).toBe(2);

    const flat = flattenCubic(curve, 0.5);
    expect(flat.points.length).toBeGreaterThan(8);
    // cada ponto de flatten está sobre a curva no parâmetro registrado
    flat.points.forEach((pt, i) => {
      const onCurve = evalCubic(curve, flat.params[i]);
      expect(Math.hypot(pt.x - onCurve.x, pt.y - onCurve.y)).toBeLessThan(1e-6);
    });
  });

  it('interseção de duas curvas que se cruzam no meio', () => {
    const horizontal = lineAsCubic({ x: 0, y: 50 }, { x: 100, y: 50 });
    const vertical = lineAsCubic({ x: 50, y: 0 }, { x: 50, y: 100 });
    const hits = cubicIntersections(horizontal, vertical);
    expect(hits.length).toBe(1);
    expect(hits[0].point.x).toBeCloseTo(50, 6);
    expect(hits[0].point.y).toBeCloseTo(50, 6);
    expect(hits[0].ta).toBeCloseTo(0.5, 2);
  });

  it('toque em extremidade compartilhada NÃO conta como interseção', () => {
    const a = lineAsCubic({ x: 0, y: 0 }, { x: 100, y: 0 });
    const b = lineAsCubic({ x: 100, y: 0 }, { x: 200, y: 100 });
    expect(cubicIntersections(a, b)).toEqual([]);
  });

  it('curvas paralelas não intersectam', () => {
    const a = lineAsCubic({ x: 0, y: 0 }, { x: 100, y: 0 });
    const b = lineAsCubic({ x: 0, y: 10 }, { x: 100, y: 10 });
    expect(cubicIntersections(a, b)).toEqual([]);
  });
});
