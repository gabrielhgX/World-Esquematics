import type { TerrainLayer } from '../layers/TerrainLayer';
import type { RoadEdge, RoadLayer } from '../layers/RoadLayer';
import { flattenCubic, type Cubic } from '../geometry/bezier';

/**
 * Validação de inclinação de estradas (README §4.5/§11 item 19):
 * o carve é bloqueável quando a via excede o maxGrade_pct dela.
 * Derivado — calculado sob demanda, nunca persistido (D6).
 */

export interface RoadGradeStats {
  /** inclinação máxima encontrada, em % */
  maxGrade_pct: number;
  length_m: number;
}

export function roadGradeStats(terrain: TerrainLayer, curve: Cubic): RoadGradeStats {
  const { points } = flattenCubic(curve, 1);
  let maxGrade = 0;
  let length = 0;
  let previous = points[0];
  let previousHeight = terrain.getHeight(previous.x, previous.y);

  for (let i = 1; i < points.length; i++) {
    const current = points[i];
    const dist = Math.hypot(current.x - previous.x, current.y - previous.y);
    if (dist < 1e-9) continue;
    const height = terrain.getHeight(current.x, current.y);
    const grade = (Math.abs(height - previousHeight) / dist) * 100;
    if (grade > maxGrade) maxGrade = grade;
    length += dist;
    previous = current;
    previousHeight = height;
  }
  return { maxGrade_pct: maxGrade, length_m: length };
}

export interface GradeViolation {
  edge: RoadEdge;
  maxGrade_pct: number;
}

/** Arestas (não-ponte, com carve) que excedem o próprio maxGrade_pct. */
export function findGradeViolations(terrain: TerrainLayer, roads: RoadLayer): GradeViolation[] {
  const violations: GradeViolation[] = [];
  for (const edge of roads.edges.values()) {
    if (edge.type === 'bridge' || !edge.carveTerrain) continue;
    const from = roads.getNode(edge.from);
    const to = roads.getNode(edge.to);
    if (!from || !to) continue;
    const stats = roadGradeStats(terrain, { p0: from.pos, c1: edge.c1, c2: edge.c2, p1: to.pos });
    if (stats.maxGrade_pct > edge.maxGrade_pct) {
      violations.push({ edge, maxGrade_pct: stats.maxGrade_pct });
    }
  }
  return violations;
}
