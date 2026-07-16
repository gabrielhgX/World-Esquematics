/**
 * Bézier cúbica genérica (README §4.5, item 17 do roadmap) — reusada por
 * estradas, e nas próximas fases por regiões, biomas e rios.
 *
 * Amostragem por FLATTEN ADAPTATIVO por tolerância (0,5 m), nunca por número
 * fixo de segmentos (README §4.5).
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Cubic {
  p0: Pt;
  c1: Pt;
  c2: Pt;
  p1: Pt;
}

/** Tolerância padrão de flatten em metros (README §4.5). */
export const FLATTEN_TOLERANCE_M = 0.5;

/** Segmento reto expresso como cúbica (controles nos terços). */
export function lineAsCubic(p0: Pt, p1: Pt): Cubic {
  return {
    p0,
    c1: { x: p0.x + (p1.x - p0.x) / 3, y: p0.y + (p1.y - p0.y) / 3 },
    c2: { x: p0.x + (2 * (p1.x - p0.x)) / 3, y: p0.y + (2 * (p1.y - p0.y)) / 3 },
    p1,
  };
}

export function evalCubic(b: Cubic, t: number): Pt {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return {
    x: w0 * b.p0.x + w1 * b.c1.x + w2 * b.c2.x + w3 * b.p1.x,
    y: w0 * b.p0.y + w1 * b.c1.y + w2 * b.c2.y + w3 * b.p1.y,
  };
}

/** Split de de Casteljau em t: as duas metades reproduzem a curva exata. */
export function splitCubic(b: Cubic, t: number): [Cubic, Cubic] {
  const lerp = (a: Pt, c: Pt): Pt => ({ x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t });
  const q0 = lerp(b.p0, b.c1);
  const q1 = lerp(b.c1, b.c2);
  const q2 = lerp(b.c2, b.p1);
  const r0 = lerp(q0, q1);
  const r1 = lerp(q1, q2);
  const s = lerp(r0, r1);
  return [
    { p0: b.p0, c1: q0, c2: r0, p1: s },
    { p0: s, c1: r1, c2: q2, p1: b.p1 },
  ];
}

/** Split em vários t crescentes (re-parametrizando a cada corte). */
export function splitCubicAt(b: Cubic, ts: number[]): Cubic[] {
  const pieces: Cubic[] = [];
  let remaining = b;
  let consumed = 0;
  for (const t of ts) {
    const local = (t - consumed) / (1 - consumed);
    const [head, tail] = splitCubic(remaining, Math.min(1, Math.max(0, local)));
    pieces.push(head);
    remaining = tail;
    consumed = t;
  }
  pieces.push(remaining);
  return pieces;
}

export interface FlattenedCubic {
  /** pontos incluindo as extremidades */
  points: Pt[];
  /** parâmetro t de cada ponto */
  params: number[];
}

/** Flatten adaptativo: subdivide até os controles caberem na tolerância. */
export function flattenCubic(b: Cubic, tolerance_m = FLATTEN_TOLERANCE_M): FlattenedCubic {
  const points: Pt[] = [b.p0];
  const params: number[] = [0];
  const tol2 = tolerance_m * tolerance_m;

  const recurse = (c: Cubic, t0: number, t1: number, depth: number): void => {
    if (
      depth > 24 ||
      (distToSegment2(c.c1, c.p0, c.p1) <= tol2 && distToSegment2(c.c2, c.p0, c.p1) <= tol2)
    ) {
      points.push(c.p1);
      params.push(t1);
      return;
    }
    const tm = (t0 + t1) / 2;
    const [head, tail] = splitCubic(c, 0.5);
    recurse(head, t0, tm, depth + 1);
    recurse(tail, tm, t1, depth + 1);
  };
  recurse(b, 0, 1, 0);
  return { points, params };
}

export interface CurveIntersection {
  ta: number;
  tb: number;
  point: Pt;
}

/**
 * Interseções entre duas cúbicas via flatten + segmento×segmento.
 * Toques nas extremidades (t ≈ 0/1) são ignorados — nós compartilhados já
 * representam essas junções no grafo planar.
 */
export function cubicIntersections(
  a: Cubic,
  b: Cubic,
  tolerance_m = FLATTEN_TOLERANCE_M,
): CurveIntersection[] {
  const fa = flattenCubic(a, tolerance_m);
  const fb = flattenCubic(b, tolerance_m);
  const hits: CurveIntersection[] = [];
  const T_EPS = 1e-3;

  for (let i = 0; i + 1 < fa.points.length; i++) {
    for (let j = 0; j + 1 < fb.points.length; j++) {
      const hit = segmentIntersection(
        fa.points[i],
        fa.points[i + 1],
        fb.points[j],
        fb.points[j + 1],
      );
      if (!hit) continue;
      const ta = fa.params[i] + (fa.params[i + 1] - fa.params[i]) * hit.t;
      const tb = fb.params[j] + (fb.params[j + 1] - fb.params[j]) * hit.u;
      if (ta < T_EPS || ta > 1 - T_EPS || tb < T_EPS || tb > 1 - T_EPS) continue;
      // dedupe: flatten pode gerar o mesmo cruzamento em segmentos vizinhos
      if (hits.some((h) => Math.abs(h.ta - ta) < 5e-3)) continue;
      hits.push({ ta, tb, point: hit.point });
    }
  }
  hits.sort((p, q) => p.ta - q.ta);
  return hits;
}

function segmentIntersection(
  a0: Pt,
  a1: Pt,
  b0: Pt,
  b1: Pt,
): { t: number; u: number; point: Pt } | null {
  const dax = a1.x - a0.x;
  const day = a1.y - a0.y;
  const dbx = b1.x - b0.x;
  const dby = b1.y - b0.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-12) return null; // paralelos
  const t = ((b0.x - a0.x) * dby - (b0.y - a0.y) * dbx) / denom;
  const u = ((b0.x - a0.x) * day - (b0.y - a0.y) * dax) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, point: { x: a0.x + dax * t, y: a0.y + day * t } };
}

function distToSegment2(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) {
    t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  }
  const px = a.x + t * dx - p.x;
  const py = a.y + t * dy - p.y;
  return px * px + py * py;
}
