import { describe, expect, it } from 'vitest';
import { WorldData } from '../world/WorldData';
import { createWorldConfig } from '../world/WorldConfig';
import { heightToU16 } from '../world/conversions';
import { lineAsCubic } from '../geometry/bezier';
import { findGradeViolations, roadGradeStats } from './roadGrade';
import { planRoadPath } from '../geometry/planarGraph';
import { RoadGraphCommand } from '../commands/roadCommands';
import { CommandBus } from '../commands/CommandBus';
import { History } from '../commands/History';

const RANGE = { min_m: -200, max_m: 1800 };

/** Rampa uniforme: h = x × slope. */
const makeSlopeWorld = (slope: number) => {
  const world = new WorldData(
    createWorldConfig({
      projectName: 'Teste',
      extent: { width_m: 2048, height_m: 2048 },
      terrainResolution_m: 4,
      heightRange: RANGE,
    }),
  );
  const raster = world.terrain.raster;
  for (let cy = 0; cy < 512; cy++) {
    for (let cx = 0; cx < 512; cx++) {
      raster.set(cx, cy, heightToU16(cx * 4 * slope, RANGE));
    }
  }
  return world;
};

describe('validação de maxGrade_pct (README §4.5, item 19)', () => {
  it('estrada subindo rampa de 10% mede ~10% de inclinação', () => {
    const world = makeSlopeWorld(0.1);
    const stats = roadGradeStats(
      world.terrain,
      lineAsCubic({ x: 200, y: 1000 }, { x: 1200, y: 1000 }),
    );
    expect(stats.maxGrade_pct).toBeGreaterThan(8);
    expect(stats.maxGrade_pct).toBeLessThan(12);
    expect(stats.length_m).toBeCloseTo(1000, 0);
  });

  it('estrada em curva de nível (sem subida) mede ~0%', () => {
    const world = makeSlopeWorld(0.1);
    const stats = roadGradeStats(
      world.terrain,
      lineAsCubic({ x: 600, y: 200 }, { x: 600, y: 1200 }),
    );
    expect(stats.maxGrade_pct).toBeLessThan(1);
  });

  it('findGradeViolations pega vias acima do próprio limite e poupa pontes', () => {
    const world = makeSlopeWorld(0.2); // 20% de rampa
    const bus = new CommandBus(world, new History());
    const line = lineAsCubic({ x: 200, y: 600 }, { x: 1200, y: 600 });
    const spec = {
      fromNodeId: null,
      fromPos: line.p0,
      toNodeId: null,
      toPos: line.p1,
      c1: line.c1,
      c2: line.c2,
    };
    // estrada comum com limite 12% — violada pela rampa de 20%
    bus.execute(
      new RoadGraphCommand(
        'Estrada',
        planRoadPath(world.roads, [spec], {
          width_m: 8,
          type: 'asphalt',
          material: 'road',
          carveTerrain: true,
          maxGrade_pct: 12,
        }),
      ),
    );
    // ponte na mesma rampa — ignorada (não carva, mantém cota)
    const bridgeLine = lineAsCubic({ x: 200, y: 1400 }, { x: 1200, y: 1400 });
    bus.execute(
      new RoadGraphCommand(
        'Ponte',
        planRoadPath(
          world.roads,
          [
            {
              fromNodeId: null,
              fromPos: bridgeLine.p0,
              toNodeId: null,
              toPos: bridgeLine.p1,
              c1: bridgeLine.c1,
              c2: bridgeLine.c2,
            },
          ],
          { width_m: 8, type: 'bridge', material: 'bridge', carveTerrain: false, maxGrade_pct: 12 },
        ),
      ),
    );

    const violations = findGradeViolations(world.terrain, world.roads);
    expect(violations.length).toBe(1);
    expect(violations[0].maxGrade_pct).toBeGreaterThan(12);
    expect(violations[0].edge.type).toBe('asphalt');
  });
});
