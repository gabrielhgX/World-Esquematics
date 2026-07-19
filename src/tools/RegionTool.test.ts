import { describe, expect, it } from 'vitest';
import { CommandBus, History, TsRasterKernels, WorldData, createWorldConfig } from '../core';
import { Camera2D } from '../render/Camera2D';
import { RegionTool } from './RegionTool';
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

describe('RegionTool (README §4.6) — só emite Commands', () => {
  it('cliques + Enter fecham o polígono; undo remove', () => {
    const ctx = makeContext();
    const tool = new RegionTool(ctx);
    tool.settings = { name: 'Reino', color: '#3366aa' };

    tool.onPointerDown({ x: 100, y: 100 }, mods);
    tool.onPointerDown({ x: 900, y: 100 }, mods);
    tool.onPointerDown({ x: 900, y: 900 }, mods);
    expect(tool.vertexCount).toBe(3);
    expect(tool.onKeyDown('Enter')).toBe(true);

    expect(ctx.world.regions.regions.length).toBe(1);
    const region = ctx.world.regions.regions[0];
    expect(region.name).toBe('Reino');
    expect(region.color).toBe('#3366aa');
    expect(region.polygon.length).toBe(3);
    expect(tool.vertexCount).toBe(0); // rascunho consumido

    ctx.bus.undo();
    expect(ctx.world.regions.regions.length).toBe(0);
  });

  it('menos de 3 vértices: Enter não cria região e limpa o rascunho', () => {
    const ctx = makeContext();
    const tool = new RegionTool(ctx);
    tool.onPointerDown({ x: 100, y: 100 }, mods);
    tool.onPointerDown({ x: 200, y: 200 }, mods);
    expect(tool.onKeyDown('Enter')).toBe(true);
    expect(ctx.world.regions.regions.length).toBe(0);
    expect(tool.vertexCount).toBe(0);
  });

  it('Escape descarta o rascunho; camada travada bloqueia cliques', () => {
    const ctx = makeContext();
    const tool = new RegionTool(ctx);
    tool.onPointerDown({ x: 100, y: 100 }, mods);
    expect(tool.onKeyDown('Escape')).toBe(true);
    expect(tool.vertexCount).toBe(0);

    ctx.world.regions.locked = true;
    tool.onPointerDown({ x: 100, y: 100 }, mods);
    expect(tool.vertexCount).toBe(0); // trava impede até o rascunho
  });
});
