import { describe, expect, it } from 'vitest';
import { WorldData } from '../world/WorldData';
import { createWorldConfig } from '../world/WorldConfig';
import { CommandBus } from './CommandBus';
import { History } from './History';
import { SculptCommand } from './SculptCommand';
import { TsRasterKernels } from '../raster/kernelsTs';
import { stampCellBounds, type BrushStamp } from '../raster/kernels';

const kernels = new TsRasterKernels();

const makeWorld = () =>
  new WorldData(
    createWorldConfig({
      projectName: 'Teste',
      extent: { width_m: 8192, height_m: 8192 },
      terrainResolution_m: 4,
      heightRange: { min_m: -200, max_m: 1800 },
    }),
  );

function dabCommand(world: WorldData, cx: number, cy: number, amount = 500): SculptCommand {
  const stamp: BrushStamp = {
    cx_cells: cx,
    cy_cells: cy,
    radius_cells: 8,
    strength: 1,
    falloff: 'constant',
  };
  const raster = world.terrain.raster;
  const bounds = stampCellBounds(raster, stamp);
  const keys = bounds ? raster.tilesInCellRect(bounds.x0, bounds.y0, bounds.x1, bounds.y1) : [];
  return new SculptCommand('Esculpir terreno', (r) => kernels.applyRaise(r, stamp, amount), keys);
}

describe('SculptCommand — undo por delta de tile (README §5.1)', () => {
  it('apply → revert restaura o estado exato, inclusive desalocando tiles', () => {
    const world = makeWorld();
    const raster = world.terrain.raster;
    const base = world.terrain.baseHeight_u16;

    const command = dabCommand(world, 100, 100);
    command.apply(world);
    expect(raster.get(100, 100)).toBe(base + 500);
    expect(raster.allocatedTileCount).toBeGreaterThan(0);

    command.revert(world);
    expect(raster.get(100, 100)).toBe(base);
    expect(raster.allocatedTileCount).toBe(0); // esparsidade preservada
  });

  it('redo restaura o estado final sem re-rodar o kernel', () => {
    const world = makeWorld();
    const raster = world.terrain.raster;
    const base = world.terrain.baseHeight_u16;

    const command = dabCommand(world, 100, 100);
    command.apply(world);
    command.revert(world);
    command.apply(world); // redo
    expect(raster.get(100, 100)).toBe(base + 500); // não somou de novo
  });

  it('um traço no CommandBus (coalesce) vira UM comando; undo restaura tudo', () => {
    const world = makeWorld();
    const raster = world.terrain.raster;
    const base = world.terrain.baseHeight_u16;
    const bus = new CommandBus(world, new History());

    // dabs em tiles diferentes (tile = 512 células) no mesmo traço
    bus.execute(dabCommand(world, 100, 100), { coalesce: true });
    bus.execute(dabCommand(world, 100, 100), { coalesce: true }); // repete: acumula
    bus.execute(dabCommand(world, 600, 600), { coalesce: true });
    bus.sealCoalescing();

    expect(bus.history.undoCount).toBe(1);
    expect(raster.get(100, 100)).toBe(base + 1000);
    expect(raster.get(600, 600)).toBe(base + 500);

    bus.undo();
    expect(raster.get(100, 100)).toBe(base);
    expect(raster.get(600, 600)).toBe(base);
    expect(raster.allocatedTileCount).toBe(0);

    bus.redo();
    expect(raster.get(100, 100)).toBe(base + 1000);
    expect(raster.get(600, 600)).toBe(base + 500);
  });

  it('memoryCost cresce com os tiles tocados (nunca o mapa inteiro)', () => {
    const world = makeWorld();
    const single = dabCommand(world, 100, 100);
    single.apply(world);
    // 1 tile tocado: before (null, custo 0) + after (512² × 2 bytes)
    expect(single.memoryCost).toBe(512 * 512 * 2);

    const world2 = makeWorld();
    const spanning = dabCommand(world2, 512, 512); // canto de 4 tiles
    spanning.apply(world2);
    expect(spanning.memoryCost).toBe(4 * 512 * 512 * 2);
  });

  it('não funde com comandos de outro tipo', () => {
    const world = makeWorld();
    const command = dabCommand(world, 100, 100);
    const other = {
      label: 'x',
      memoryCost: 0,
      apply: () => {},
      revert: () => {},
    };
    expect(command.mergeWith(other)).toBeNull();
  });
});
