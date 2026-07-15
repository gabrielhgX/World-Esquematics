import type { Layer } from '../world/Layer';
import type { Pt } from '../geometry/bezier';

/**
 * RoadLayer — GRAFO PLANAR de splines (README §4.5, D9), não polilinhas
 * soltas: estradas que se cruzam ganham nós de interseção reais em ambas,
 * senão não existe snap, nem render de cruzamento, nem detecção de quadras.
 *
 * Escrita SEMPRE via Commands (D7).
 */

export type RoadType = 'trail' | 'dirt' | 'gravel' | 'asphalt' | 'highway' | 'bridge';

export interface RoadNode {
  id: string;
  pos: Pt;
  kind: 'endpoint' | 'intersection';
}

export interface RoadEdge {
  id: string;
  from: string;
  to: string;
  /** Bézier cúbica: from, c1, c2, to (README §4.5) */
  c1: Pt;
  c2: Pt;
  width_m: number;
  type: RoadType;
  material: string;
  carveTerrain: boolean;
  /** inclinação máxima permitida (validada no carve) */
  maxGrade_pct: number;
}

export class RoadLayer implements Layer {
  readonly type = 'road' as const;
  name = 'Estradas';
  visible = true;
  locked = false;
  opacity = 1;
  order = 2;

  private readonly nodeMap = new Map<string, RoadNode>();
  private readonly edgeMap = new Map<string, RoadEdge>();
  private _version = 0;

  constructor(readonly id: string) {}

  get version(): number {
    return this._version;
  }

  get nodes(): ReadonlyMap<string, RoadNode> {
    return this.nodeMap;
  }

  get edges(): ReadonlyMap<string, RoadEdge> {
    return this.edgeMap;
  }

  getNode(id: string): RoadNode | undefined {
    return this.nodeMap.get(id);
  }

  /** [Command] */
  addNode(node: RoadNode): void {
    this.nodeMap.set(node.id, node);
    this.touch();
  }

  /** [Command] */
  removeNode(id: string): void {
    this.nodeMap.delete(id);
    this.touch();
  }

  /** [Command] */
  addEdge(edge: RoadEdge): void {
    this.edgeMap.set(edge.id, edge);
    this.touch();
  }

  /** [Command] */
  removeEdge(id: string): void {
    this.edgeMap.delete(id);
    this.touch();
  }

  /** Nó mais próximo dentro do raio (snap a nó — README §11 item 18). */
  nearestNode(pt: Pt, radius_m: number): RoadNode | null {
    let best: RoadNode | null = null;
    let bestDist2 = radius_m * radius_m;
    for (const node of this.nodeMap.values()) {
      const dx = node.pos.x - pt.x;
      const dy = node.pos.y - pt.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestDist2) {
        bestDist2 = d2;
        best = node;
      }
    }
    return best;
  }

  private touch(): void {
    this._version++;
  }
}
