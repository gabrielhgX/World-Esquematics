import { describe, expect, it } from 'vitest';
import { WorldData } from '../world/WorldData';
import { createWorldConfig } from '../world/WorldConfig';
import { CommandBus } from './CommandBus';
import { History } from './History';
import { AddRiversCommand, FloodFillWaterCommand, SetSeaLevelCommand } from './waterCommands';
import type { RiverSpline, WaterBody } from '../layers/WaterLayer';

const makeWorld = () =>
  new WorldData(
    createWorldConfig({
      projectName: 'Teste',
      extent: { width_m: 1024, height_m: 1024 },
      terrainResolution_m: 4,
      heightRange: { min_m: -200, max_m: 1800 },
    }),
  );

const makeLake = (): WaterBody => ({
  id: 'lake-1',
  kind: 'lake',
  surface_m: 20,
  polygon: [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ],
  material: 'water_lake',
});

const makeRiver = (id: string): RiverSpline => ({
  id,
  nodes: [
    { x: 0, y: 500, width_m: 10, surface_m: 50 },
    { x: 500, y: 500, width_m: 12, surface_m: 40 },
  ],
  carveDepth_m: 2,
});

describe('comandos de água (README §5.2)', () => {
  it('FloodFillWaterCommand: apply adiciona, undo remove', () => {
    const world = makeWorld();
    const bus = new CommandBus(world, new History());
    bus.execute(new FloodFillWaterCommand(makeLake()));
    expect(world.water.lakes.length).toBe(1);
    bus.undo();
    expect(world.water.lakes.length).toBe(0);
    bus.redo();
    expect(world.water.lakes.length).toBe(1);
  });

  it('mundo nasce com o oceano global e surfaceAt cobre lagos', () => {
    const world = makeWorld();
    expect(world.water.ocean.kind).toBe('ocean');
    expect(world.water.seaLevel_m).toBe(0);

    world.water.addBody(makeLake());
    expect(world.water.surfaceAt(50, 50)).toBe(20); // dentro do lago
    expect(world.water.surfaceAt(500, 500)).toBe(0); // só o oceano
  });

  it('AddRiversCommand: N rios entram e saem juntos (Sugerir rios)', () => {
    const world = makeWorld();
    const bus = new CommandBus(world, new History());
    bus.execute(new AddRiversCommand('Sugerir rios', [makeRiver('r1'), makeRiver('r2')]));
    expect(world.water.rivers.length).toBe(2);
    bus.undo();
    expect(world.water.rivers.length).toBe(0);
  });

  it('SetSeaLevelCommand coalesce: arrasto do campo vira UM comando', () => {
    const world = makeWorld();
    const bus = new CommandBus(world, new History());
    bus.execute(new SetSeaLevelCommand(5), { coalesce: true });
    bus.execute(new SetSeaLevelCommand(12), { coalesce: true });
    bus.execute(new SetSeaLevelCommand(20), { coalesce: true });
    bus.sealCoalescing();

    expect(world.water.seaLevel_m).toBe(20);
    expect(bus.history.undoCount).toBe(1);
    bus.undo();
    expect(world.water.seaLevel_m).toBe(0); // before mais antigo preservado
  });

  it('mutações da água bumpam a versão (invalidação de derivados)', () => {
    const world = makeWorld();
    const v0 = world.water.version;
    world.water.setSeaLevel(3);
    world.water.addBody(makeLake());
    expect(world.water.version).toBeGreaterThan(v0);
  });
});
