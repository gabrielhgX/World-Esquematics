import { describe, expect, it } from 'vitest';
import { WorldData } from '../world/WorldData';
import { createWorldConfig } from '../world/WorldConfig';
import { CommandBus } from '../commands/CommandBus';
import { History } from '../commands/History';
import { RoadGraphCommand } from '../commands/roadCommands';
import { lineAsCubic } from './bezier';
import { planRoadPath, type RoadEdgeProps, type RoadSegmentSpec } from './planarGraph';

const PROPS: RoadEdgeProps = {
  width_m: 8,
  type: 'dirt',
  material: 'road_dirt',
  carveTerrain: true,
  maxGrade_pct: 12,
};

const makeWorld = () =>
  new WorldData(
    createWorldConfig({
      projectName: 'Teste',
      extent: { width_m: 4096, height_m: 4096 },
      terrainResolution_m: 4,
      heightRange: { min_m: -200, max_m: 1800 },
    }),
  );

const straightSegment = (x0: number, y0: number, x1: number, y1: number): RoadSegmentSpec => {
  const line = lineAsCubic({ x: x0, y: y0 }, { x: x1, y: y1 });
  return {
    fromNodeId: null,
    fromPos: { x: x0, y: y0 },
    toNodeId: null,
    toPos: { x: x1, y: y1 },
    c1: line.c1,
    c2: line.c2,
  };
};

describe('grafo planar de estradas (README §4.5, D9)', () => {
  it('estrada simples: 2 nós endpoint + 1 aresta', () => {
    const world = makeWorld();
    const plan = planRoadPath(world.roads, [straightSegment(100, 100, 500, 100)], PROPS);
    expect(plan.nodesToAdd.length).toBe(2);
    expect(plan.edgesToAdd.length).toBe(1);
    expect(plan.edgesToRemove.length).toBe(0);
    expect(plan.nodesToAdd.every((n) => n.kind === 'endpoint')).toBe(true);
  });

  it('cruzamento insere nó de interseção EM AMBAS e divide as arestas', () => {
    const world = makeWorld();
    const bus = new CommandBus(world, new History());
    // estrada horizontal
    bus.execute(
      new RoadGraphCommand(
        'Estrada A',
        planRoadPath(world.roads, [straightSegment(100, 300, 700, 300)], PROPS),
      ),
    );
    expect(world.roads.edges.size).toBe(1);

    // estrada vertical cruzando a horizontal
    const plan = planRoadPath(world.roads, [straightSegment(400, 100, 400, 500)], PROPS);
    // nós: 2 endpoints novos + 1 interseção
    expect(plan.nodesToAdd.length).toBe(3);
    expect(plan.nodesToAdd.filter((n) => n.kind === 'intersection').length).toBe(1);
    // a horizontal é removida e vira 2 pedaços; a vertical entra como 2 pedaços
    expect(plan.edgesToRemove.length).toBe(1);
    expect(plan.edgesToAdd.length).toBe(4);

    bus.execute(new RoadGraphCommand('Estrada B', plan));
    expect(world.roads.edges.size).toBe(4);
    expect(world.roads.nodes.size).toBe(5);

    // o nó de interseção fica no cruzamento geométrico (400, 300)
    const intersection = [...world.roads.nodes.values()].find((n) => n.kind === 'intersection')!;
    expect(intersection.pos.x).toBeCloseTo(400, 0);
    expect(intersection.pos.y).toBeCloseTo(300, 0);

    // undo restaura o grafo anterior EXATO
    bus.undo();
    expect(world.roads.edges.size).toBe(1);
    expect(world.roads.nodes.size).toBe(2);
    bus.redo();
    expect(world.roads.edges.size).toBe(4);
  });

  it('caminho multi-segmento compartilha nós consecutivos', () => {
    const world = makeWorld();
    const a = straightSegment(100, 100, 300, 100);
    const b = straightSegment(300, 100, 500, 200);
    const plan = planRoadPath(world.roads, [a, b], PROPS);
    // o fim de A e o começo de B se fundem num nó só (merge por proximidade)
    expect(plan.nodesToAdd.length).toBe(3);
    expect(plan.edgesToAdd.length).toBe(2);
  });

  it('snap: segmento partindo de nó existente não cria nó novo', () => {
    const world = makeWorld();
    const bus = new CommandBus(world, new History());
    bus.execute(
      new RoadGraphCommand(
        'Estrada A',
        planRoadPath(world.roads, [straightSegment(100, 100, 500, 100)], PROPS),
      ),
    );
    const existing = world.roads.nearestNode({ x: 500, y: 100 }, 5)!;
    expect(existing).toBeTruthy();

    const line = lineAsCubic(existing.pos, { x: 800, y: 400 });
    const plan = planRoadPath(
      world.roads,
      [
        {
          fromNodeId: existing.id,
          fromPos: existing.pos,
          toNodeId: null,
          toPos: { x: 800, y: 400 },
          c1: line.c1,
          c2: line.c2,
        },
      ],
      PROPS,
    );
    expect(plan.nodesToAdd.length).toBe(1); // só o destino
    expect(plan.edgesToAdd[0].from).toBe(existing.id);
  });

  it('um segmento cruzando DUAS estradas gera duas interseções e 3 pedaços', () => {
    const world = makeWorld();
    const bus = new CommandBus(world, new History());
    bus.execute(
      new RoadGraphCommand(
        'A',
        planRoadPath(world.roads, [straightSegment(200, 100, 200, 500)], PROPS),
      ),
    );
    bus.execute(
      new RoadGraphCommand(
        'B',
        planRoadPath(world.roads, [straightSegment(600, 100, 600, 500)], PROPS),
      ),
    );
    const plan = planRoadPath(world.roads, [straightSegment(50, 300, 750, 300)], PROPS);
    expect(plan.nodesToAdd.filter((n) => n.kind === 'intersection').length).toBe(2);
    expect(plan.edgesToRemove.length).toBe(2);
    // 2 verticais viram 4 pedaços + horizontal vira 3 pedaços
    expect(plan.edgesToAdd.length).toBe(7);
  });
});
