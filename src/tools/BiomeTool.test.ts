import { describe, expect, it } from 'vitest';
import { CommandBus, History, TsRasterKernels, WorldData, createWorldConfig } from '../core';
import { Camera2D } from '../render/Camera2D';
import { BiomeTool } from './BiomeTool';
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
  return {
    world,
    bus,
    camera: new Camera2D(),
    kernels: new TsRasterKernels(),
    requestRender: () => {},
  };
};

describe('BiomeTool (README §4.4) — só emite Commands', () => {
  it('cliques + Enter pintam o polígono do bioma; undo remove', () => {
    const ctx = makeContext();
    const tool = new BiomeTool(ctx);
    tool.settings = { biomeId: 2, featherRadius_m: 24 };
    tool.onPointerDown({ x: 100, y: 100 }, mods);
    tool.onPointerDown({ x: 900, y: 100 }, mods);
    tool.onPointerDown({ x: 500, y: 800 }, mods);
    expect(tool.onKeyDown('Enter')).toBe(true);

    expect(ctx.world.biomes.polygons.length).toBe(1);
    const painted = ctx.world.biomes.polygons[0];
    expect(painted.biomeId).toBe(2);
    expect(painted.featherRadius_m).toBe(24);
    expect(painted.polygon.length).toBe(3);

    ctx.bus.undo();
    expect(ctx.world.biomes.polygons.length).toBe(0);
  });

  it('menos de 3 vértices não emite comando; Esc cancela', () => {
    const ctx = makeContext();
    const tool = new BiomeTool(ctx);
    tool.onPointerDown({ x: 100, y: 100 }, mods);
    tool.onPointerDown({ x: 200, y: 100 }, mods);
    tool.onKeyDown('Enter');
    expect(ctx.bus.history.undoCount).toBe(0);

    tool.onPointerDown({ x: 100, y: 100 }, mods);
    expect(tool.onKeyDown('Escape')).toBe(true);
    expect(tool.vertexCount).toBe(0);
  });
});

describe('ObjectTool (README §4.6)', () => {
  it('clique adiciona objeto manual com Z derivado; undo remove', () => {
    const ctx = makeContext();
    const tool = new ObjectTool(ctx);
    tool.settings = { type: 'tower_01', alignToSlope: true };
    tool.onPointerDown({ x: 1000, y: 1000 }, mods);

    expect(ctx.world.objects.objects.length).toBe(1);
    const object = ctx.world.objects.objects[0];
    expect(object.type).toBe('tower_01');
    expect(object.alignToSlope).toBe(true);
    expect(object.z_offset_m).toBe(0); // colado no terreno

    ctx.bus.undo();
    expect(ctx.world.objects.objects.length).toBe(0);
  });
});
