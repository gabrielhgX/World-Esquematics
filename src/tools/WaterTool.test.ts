import { describe, expect, it } from 'vitest';
import {
  CommandBus,
  History,
  TsRasterKernels,
  WorldData,
  createWorldConfig,
  heightToU16,
} from '../core';
import { Camera2D } from '../render/Camera2D';
import { WaterTool } from './WaterTool';
import type { ToolContext } from './Tool';

const RANGE = { min_m: -200, max_m: 1800 };
const mods = { shift: false, ctrl: false, alt: false };

/** Mundo com uma cratera (fundo −50 m) centrada em (1024, 1024). */
const makeContext = (): ToolContext & { world: WorldData; bus: CommandBus } => {
  const world = new WorldData(
    createWorldConfig({
      projectName: 'Teste',
      extent: { width_m: 2048, height_m: 2048 },
      terrainResolution_m: 4,
      heightRange: RANGE,
    }),
  );
  const raster = world.terrain.raster;
  const low = heightToU16(-50, RANGE);
  for (let cy = 206; cy <= 306; cy++) {
    for (let cx = 206; cx <= 306; cx++) {
      const dx = cx - 256;
      const dy = cy - 256;
      if (dx * dx + dy * dy <= 50 * 50) raster.set(cx, cy, low);
    }
  }
  raster.consumeDirty();
  const bus = new CommandBus(world, new History());
  return {
    world,
    bus,
    camera: new Camera2D(),
    kernels: new TsRasterKernels(),
    requestRender: () => {},
  };
};

describe('WaterTool (README §7.2) — só emite Commands', () => {
  it('modo lago: clique na cratera cria WaterBody com polígono; undo remove', () => {
    const ctx = makeContext();
    const tool = new WaterTool(ctx);
    tool.settings = { ...tool.settings, mode: 'lake', lakeSurface_m: -20 };

    tool.onPointerDown({ x: 1024, y: 1024 }, mods);
    expect(ctx.world.water.lakes.length).toBe(1);
    const lake = ctx.world.water.lakes[0];
    expect(lake.kind).toBe('lake');
    expect(lake.surface_m).toBe(-20);
    expect(lake.polygon.length).toBeGreaterThan(3);
    // surfaceAt devolve a superfície mais ALTA — e o oceano só conta
    // depois de LIGADO (água nunca aparece sozinha ao escavar)
    expect(ctx.world.water.surfaceAt(100, 100)).toBe(-Infinity); // fora, seco
    ctx.world.water.setSeaLevel(-100);
    ctx.world.water.setOceanEnabled(true);
    expect(ctx.world.water.surfaceAt(1024, 1024)).toBe(-20);
    expect(ctx.world.water.surfaceAt(100, 100)).toBe(-100); // fora do lago

    ctx.bus.undo();
    expect(ctx.world.water.lakes.length).toBe(0);
  });

  it('modo lago: clique em terra seca não emite comando', () => {
    const ctx = makeContext();
    const tool = new WaterTool(ctx);
    tool.settings = { ...tool.settings, mode: 'lake', lakeSurface_m: -20 };
    tool.onPointerDown({ x: 100, y: 100 }, mods);
    expect(ctx.bus.history.undoCount).toBe(0);
  });

  it('modo rio: cliques + Enter criam a spline com cota decrescente', () => {
    const ctx = makeContext();
    const tool = new WaterTool(ctx);
    tool.settings = { ...tool.settings, mode: 'river', carveBed: false };

    tool.onPointerDown({ x: 200, y: 1800 }, mods);
    tool.onPointerDown({ x: 600, y: 1400 }, mods);
    tool.onPointerDown({ x: 1024, y: 1024 }, mods); // termina na cratera
    expect(tool.draftNodeCount).toBe(3);
    expect(tool.onKeyDown('Enter')).toBe(true);

    expect(ctx.world.water.rivers.length).toBe(1);
    const river = ctx.world.water.rivers[0];
    expect(river.nodes.length).toBe(3);
    for (let i = 1; i < river.nodes.length; i++) {
      expect(river.nodes[i].surface_m).toBeLessThan(river.nodes[i - 1].surface_m);
    }

    ctx.bus.undo();
    expect(ctx.world.water.rivers.length).toBe(0);
  });

  it('modo rio: Escape cancela o rascunho sem comando', () => {
    const ctx = makeContext();
    const tool = new WaterTool(ctx);
    tool.settings = { ...tool.settings, mode: 'river' };
    tool.onPointerDown({ x: 200, y: 200 }, mods);
    expect(tool.onKeyDown('Escape')).toBe(true);
    expect(tool.onKeyDown('Enter')).toBe(true); // sem nós: não cria nada
    expect(ctx.bus.history.undoCount).toBe(0);
    expect(ctx.world.water.rivers.length).toBe(0);
  });

  it('carvar leito: rebaixa o terreno sob a spline (comando explícito, com undo)', () => {
    const ctx = makeContext();
    const tool = new WaterTool(ctx);
    tool.settings = {
      ...tool.settings,
      mode: 'river',
      carveBed: true,
      carveDepth_m: 5,
      riverWidth_m: 24,
    };

    const before = ctx.world.terrain.getHeight(600, 600);
    tool.onPointerDown({ x: 400, y: 600 }, mods);
    tool.onPointerDown({ x: 800, y: 600 }, mods);
    tool.onKeyDown('Enter');

    // dois comandos: Desenhar rio + Carvar leito (README §4.5: explícito)
    expect(ctx.bus.history.undoCount).toBe(2);
    const after = ctx.world.terrain.getHeight(600, 600);
    expect(after).toBeLessThan(before - 3); // leito rebaixado ~5 m no centro

    ctx.bus.undo(); // desfaz o carve
    expect(ctx.world.terrain.getHeight(600, 600)).toBeCloseTo(before, 1);
    ctx.bus.undo(); // desfaz o rio
    expect(ctx.world.water.rivers.length).toBe(0);
  });

  it('carve nunca ATERRA: terreno abaixo do alvo fica intocado', () => {
    const ctx = makeContext();
    const tool = new WaterTool(ctx);
    tool.settings = {
      ...tool.settings,
      mode: 'river',
      carveBed: true,
      carveDepth_m: 2,
      riverWidth_m: 24,
    };
    // nós FORA da cratera (terreno ~0): o alvo do leito no meio do segmento
    // fica em ~−2 m, bem ACIMA do fundo de −50 m — que deve ficar intocado
    const floorBefore = ctx.world.terrain.getHeight(1024, 1024);
    tool.onPointerDown({ x: 700, y: 1024 }, mods);
    tool.onPointerDown({ x: 1348, y: 1024 }, mods);
    tool.onKeyDown('Enter');
    expect(ctx.world.terrain.getHeight(1024, 1024)).toBeCloseTo(floorBefore, 1);
  });
});
