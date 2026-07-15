/**
 * Geometria de polígonos/polilinhas em METROS float64 (D5).
 * Reusada por água (Fase 2), estradas/regiões (Fase 3) e biomas (Fase 4).
 */

/** Anel de polígono no formato do README §4.3/§4.6: [[x,y], ...] */
export type PolygonRing = Array<[number, number]>;

/** Teste par-ímpar (ray casting) — vale para polígonos côncavos. */
export function pointInPolygon(x: number, y: number, polygon: PolygonRing): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Douglas-Peucker: devolve os ÍNDICES dos pontos mantidos (crescentes).
 * Índices permitem simplificar uma polilinha preservando atributos por
 * ponto (largura/cota dos nós de rio, p.ex.).
 */
export function simplifyIndices(
  points: ReadonlyArray<[number, number]>,
  tolerance: number,
): number[] {
  if (points.length <= 2) return points.map((_, i) => i);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  const tol2 = tolerance * tolerance;
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let maxDist2 = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d2 = pointSegmentDistance2(points[i], points[first], points[last]);
      if (d2 > maxDist2) {
        maxDist2 = d2;
        index = i;
      }
    }
    if (index !== -1 && maxDist2 > tol2) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const result: number[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) result.push(i);
  return result;
}

/** Simplificação Douglas-Peucker devolvendo os próprios pontos. */
export function simplifyPolyline(
  points: ReadonlyArray<[number, number]>,
  tolerance: number,
): PolygonRing {
  return simplifyIndices(points, tolerance).map((i) => points[i]);
}

function pointSegmentDistance2(
  p: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) {
    t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    t = Math.min(1, Math.max(0, t));
  }
  const px = a[0] + t * dx - p[0];
  const py = a[1] + t * dy - p[1];
  return px * px + py * py;
}
