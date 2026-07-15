import { cubicIntersections, splitCubicAt, type Cubic, type Pt } from './bezier';
import type { RoadEdge, RoadLayer, RoadNode } from '../layers/RoadLayer';
import { newId } from '../utils/id';

/**
 * Inserção PLANAR de estradas (README §4.5, D9): ao desenhar uma estrada que
 * cruza outra, insere-se nó de interseção EM AMBAS e as arestas são divididas.
 *
 * O plano é calculado ANTES (função pura sobre o estado atual do grafo) e o
 * RoadGraphCommand só aplica/reverte — barato e determinístico para redo.
 */

export interface RoadSegmentSpec {
  /** nó existente (snap) ou null para criar em fromPos */
  fromNodeId: string | null;
  fromPos: Pt;
  toNodeId: string | null;
  toPos: Pt;
  c1: Pt;
  c2: Pt;
}

export type RoadEdgeProps = Pick<
  RoadEdge,
  'width_m' | 'type' | 'material' | 'carveTerrain' | 'maxGrade_pct'
>;

export interface RoadGraphPlan {
  nodesToAdd: RoadNode[];
  edgesToAdd: RoadEdge[];
  edgesToRemove: RoadEdge[];
}

/** distância abaixo da qual um cruzamento reutiliza um nó existente */
const NODE_MERGE_RADIUS_M = 0.75;

export function planRoadPath(
  layer: RoadLayer,
  segments: RoadSegmentSpec[],
  props: RoadEdgeProps,
): RoadGraphPlan {
  const plan: RoadGraphPlan = { nodesToAdd: [], edgesToAdd: [], edgesToRemove: [] };

  // visão de trabalho do grafo: arestas existentes + as já planejadas
  const working = new Map<string, RoadEdge>(layer.edges);
  const removeEdge = (id: string): void => {
    const existing = layer.edges.get(id);
    if (existing) plan.edgesToRemove.push(existing);
    else {
      const index = plan.edgesToAdd.findIndex((e) => e.id === id);
      if (index !== -1) plan.edgesToAdd.splice(index, 1);
    }
    working.delete(id);
  };
  const addEdge = (edge: RoadEdge): void => {
    plan.edgesToAdd.push(edge);
    working.set(edge.id, edge);
  };
  const nodePos = (id: string): Pt => {
    const planned = plan.nodesToAdd.find((n) => n.id === id);
    return (planned ?? layer.getNode(id))!.pos;
  };
  const addNode = (pos: Pt, kind: RoadNode['kind']): RoadNode => {
    const node: RoadNode = { id: newId(), pos, kind };
    plan.nodesToAdd.push(node);
    return node;
  };
  /** reutiliza nó (existente ou planejado) muito próximo do ponto */
  const findCloseNode = (pt: Pt): RoadNode | null => {
    const fromLayer = layer.nearestNode(pt, NODE_MERGE_RADIUS_M);
    if (fromLayer) return fromLayer;
    for (const node of plan.nodesToAdd) {
      if (Math.hypot(node.pos.x - pt.x, node.pos.y - pt.y) <= NODE_MERGE_RADIUS_M) return node;
    }
    return null;
  };

  for (const spec of segments) {
    const fromId =
      spec.fromNodeId ?? (findCloseNode(spec.fromPos) ?? addNode(spec.fromPos, 'endpoint')).id;
    const toId = spec.toNodeId ?? (findCloseNode(spec.toPos) ?? addNode(spec.toPos, 'endpoint')).id;
    const curve: Cubic = { p0: nodePos(fromId), c1: spec.c1, c2: spec.c2, p1: nodePos(toId) };

    // 1. cruzamentos contra TODAS as arestas do grafo de trabalho
    const crossings: Array<{ ta: number; nodeId: string }> = [];
    for (const edge of [...working.values()]) {
      const edgeCurve: Cubic = {
        p0: nodePos(edge.from),
        c1: edge.c1,
        c2: edge.c2,
        p1: nodePos(edge.to),
      };
      const hits = cubicIntersections(curve, edgeCurve);
      if (hits.length === 0) continue;

      // divide a aresta EXISTENTE nos pontos de cruzamento
      const nodesForHits = hits.map((hit) => {
        const reused = findCloseNode(hit.point);
        const node = reused ?? addNode(hit.point, 'intersection');
        crossings.push({ ta: hit.ta, nodeId: node.id });
        return node;
      });
      const pieces = splitCubicAt(
        edgeCurve,
        hits.map((h) => h.tb),
      );
      removeEdge(edge.id);
      const chain = [edge.from, ...nodesForHits.map((n) => n.id), edge.to];
      pieces.forEach((piece, index) => {
        addEdge({
          ...edge,
          id: newId(),
          from: chain[index],
          to: chain[index + 1],
          c1: piece.c1,
          c2: piece.c2,
        });
      });
    }

    // 2. divide a NOVA curva nos mesmos cruzamentos
    crossings.sort((a, b) => a.ta - b.ta);
    const pieces = splitCubicAt(
      curve,
      crossings.map((c) => c.ta),
    );
    const chain = [fromId, ...crossings.map((c) => c.nodeId), toId];
    pieces.forEach((piece, index) => {
      addEdge({
        id: newId(),
        from: chain[index],
        to: chain[index + 1],
        c1: piece.c1,
        c2: piece.c2,
        ...props,
      });
    });
  }

  return plan;
}
