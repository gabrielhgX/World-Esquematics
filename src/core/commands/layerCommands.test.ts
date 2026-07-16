import { describe, expect, it } from 'vitest';
import { WorldData } from '../world/WorldData';
import { createWorldConfig } from '../world/WorldConfig';
import { CommandBus } from './CommandBus';
import { History } from './History';
import { SetLayerPropertyCommand } from './layerCommands';

const makeWorld = () =>
  new WorldData(
    createWorldConfig({
      projectName: 'Teste',
      extent: { width_m: 1024, height_m: 1024 },
      terrainResolution_m: 4,
      heightRange: { min_m: -200, max_m: 1800 },
    }),
  );

describe('SetLayerPropertyCommand (README §5.2 — Outliner)', () => {
  it('ocultar/travar/renomear com undo', () => {
    const world = makeWorld();
    const bus = new CommandBus(world, new History());

    bus.execute(new SetLayerPropertyCommand(world.pois.id, 'visible', false));
    bus.execute(new SetLayerPropertyCommand(world.roads.id, 'locked', true));
    bus.execute(new SetLayerPropertyCommand(world.regions.id, 'name', 'Províncias'));

    expect(world.pois.visible).toBe(false);
    expect(world.roads.locked).toBe(true);
    expect(world.regions.name).toBe('Províncias');

    bus.undo();
    expect(world.regions.name).toBe('Regiões');
    bus.undo();
    expect(world.roads.locked).toBe(false);
    bus.undo();
    expect(world.pois.visible).toBe(true);
  });

  it('camada travada bloqueia a ferramenta correspondente', async () => {
    const { RegionTool } = await import('../../tools/RegionTool');
    const { Camera2D } = await import('../../render/Camera2D');
    const { TsRasterKernels } = await import('../raster/kernelsTs');

    const world = makeWorld();
    const bus = new CommandBus(world, new History());
    world.regions.locked = true;
    const tool = new RegionTool({
      world,
      bus,
      camera: new Camera2D(),
      kernels: new TsRasterKernels(),
      requestRender: () => {},
    });
    tool.onPointerDown({ x: 100, y: 100 }, { shift: false, ctrl: false, alt: false });
    tool.onPointerDown({ x: 200, y: 100 }, { shift: false, ctrl: false, alt: false });
    tool.onPointerDown({ x: 200, y: 200 }, { shift: false, ctrl: false, alt: false });
    tool.onKeyDown('Enter');
    expect(world.regions.regions.length).toBe(0);
    expect(bus.history.undoCount).toBe(0);
  });
});
