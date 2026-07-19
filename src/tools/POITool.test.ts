import { describe, expect, it } from 'vitest';
import { CommandBus, History, TsRasterKernels, WorldData, createWorldConfig } from '../core';
import { Camera2D } from '../render/Camera2D';
import { POITool } from './POITool';
import type { ToolContext } from './Tool';

const mods = { shift: false, ctrl: false, alt: false };

const makeContext = (): ToolContext & { world: WorldData; bus: CommandBus } => {
  const world = new WorldData(
    createWorldConfig({
      projectName: 'Teste',
      extent: { width_m: 2048, height_m: 2048 },
      terrainResolution_m: 4,
      heightRange: { min_m: -200, max_m: 1800 },
    }),
  );
  const bus = new CommandBus(world, new History());
  return { world, bus, camera: new Camera2D(), kernels: new TsRasterKernels(), requestRender: () => {} };
};

describe('POITool (README §4.6) — só emite Commands', () => {
  it('clique posiciona um POI no ponto; undo remove', () => {
    const ctx = makeContext();
    const tool = new POITool(ctx);
    tool.settings = { name: 'Farol', icon: '⚑' };

    tool.onPointerDown({ x: 800, y: 1200 }, mods);
    expect(ctx.world.pois.pois.length).toBe(1);
    const poi = ctx.world.pois.pois[0];
    expect(poi.name).toBe('Farol');
    expect(poi.icon).toBe('⚑');
    expect(poi.pos).toEqual({ x: 800, y: 1200 });

    ctx.bus.undo();
    expect(ctx.world.pois.pois.length).toBe(0);
  });

  it('camada travada no Outliner: clique não emite comando', () => {
    const ctx = makeContext();
    ctx.world.pois.locked = true;
    new POITool(ctx).onPointerDown({ x: 100, y: 100 }, mods);
    expect(ctx.bus.history.undoCount).toBe(0);
    expect(ctx.world.pois.pois.length).toBe(0);
  });
});
