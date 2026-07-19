import { describe, expect, it } from 'vitest';
import { CommandBus, History, TsRasterKernels, WorldData, createWorldConfig } from '../core';
import { Camera2D } from '../render/Camera2D';
import { ObjectTool } from './ObjectTool';
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

describe('ObjectTool (README §4.6) — só emite Commands', () => {
  it('clique posiciona um objeto manual; Z é derivado (z_offset 0), não armazenado', () => {
    const ctx = makeContext();
    const tool = new ObjectTool(ctx);
    tool.settings = { type: 'tower_01', alignToSlope: true };

    tool.onPointerDown({ x: 500, y: 500 }, mods);
    expect(ctx.world.objects.objects.length).toBe(1);
    const obj = ctx.world.objects.objects[0];
    expect(obj.type).toBe('tower_01');
    expect(obj.pos).toEqual({ x: 500, y: 500 });
    expect(obj.z_offset_m).toBe(0); // cota vem do terreno, nunca guardada (D)
    expect(obj.alignToSlope).toBe(true);

    ctx.bus.undo();
    expect(ctx.world.objects.objects.length).toBe(0);
  });

  it('camada travada no Outliner: clique não emite comando', () => {
    const ctx = makeContext();
    ctx.world.objects.locked = true;
    new ObjectTool(ctx).onPointerDown({ x: 100, y: 100 }, mods);
    expect(ctx.bus.history.undoCount).toBe(0);
    expect(ctx.world.objects.objects.length).toBe(0);
  });
});
