import type { Command } from './Command';
import type { WorldData } from '../world/WorldData';
import type { RoadGraphPlan } from '../geometry/planarGraph';

/**
 * AddRoadEdgeCommand (README §5.2): aplica um plano de inserção planar já
 * calculado — nós novos, arestas novas e as arestas antigas que foram
 * divididas em interseções. Sem coalescência: cada traçado é um comando.
 */
export class RoadGraphCommand implements Command {
  constructor(
    readonly label: string,
    private readonly plan: RoadGraphPlan,
  ) {}

  apply(world: WorldData): void {
    const roads = world.roads;
    for (const edge of this.plan.edgesToRemove) roads.removeEdge(edge.id);
    for (const node of this.plan.nodesToAdd) roads.addNode(node);
    for (const edge of this.plan.edgesToAdd) roads.addEdge(edge);
  }

  revert(world: WorldData): void {
    const roads = world.roads;
    for (const edge of this.plan.edgesToAdd) roads.removeEdge(edge.id);
    for (const node of this.plan.nodesToAdd) roads.removeNode(node.id);
    // arestas removidas referenciam apenas nós pré-existentes — seguro re-adicionar
    for (const edge of this.plan.edgesToRemove) roads.addEdge(edge);
  }

  get memoryCost(): number {
    return (
      256 +
      this.plan.nodesToAdd.length * 64 +
      (this.plan.edgesToAdd.length + this.plan.edgesToRemove.length) * 160
    );
  }
}
