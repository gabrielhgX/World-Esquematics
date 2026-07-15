import { describe, expect, it } from 'vitest';
import { CommandBus, History, TsRasterKernels, WorldData, createWorldConfig } from '../core';
import { Camera2D } from '../render/Camera2D';
import { SculptTool } from './SculptTool';
import type { ToolContext } from './Tool';

const makeContext = (): ToolContext & { world: WorldData; bus: CommandBus } => {
  const world = new WorldData(
    createWorldConfig({
      projectName: 'Teste',
      extent: { width_m: 8192, height_m: 8192 },
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

const mods = { shift: false, ctrl: false, alt: false };

describe('SculptTool (README §7.1) — só emite Commands', () => {
  it('um traço inteiro vira UM comando no histórico (coalescência)', () => {
    const ctx = makeContext();
    const tool = new SculptTool(ctx);
    tool.brush = { ...tool.brush, radius_m: 100, strength: 1, falloff: 'constant' };

    tool.onPointerDown({ x: 1000, y: 1000 }, mods);
    tool.onPointerMove({ x: 1100, y: 1000 });
    tool.onPointerMove({ x: 1200, y: 1000 });
    tool.onPointerUp();

    expect(ctx.bus.history.undoCount).toBe(1);
    expect(ctx.world.terrain.getHeight(1000, 1000)).toBeGreaterThan(0);

    // segundo traço = segundo comando
    tool.onPointerDown({ x: 3000, y: 3000 }, mods);
    tool.onPointerUp();
    expect(ctx.bus.history.undoCount).toBe(2);
  });

  it('spacing: arraste longo aplica múltiplos dabs interpolados', () => {
    const ctx = makeContext();
    const tool = new SculptTool(ctx);
    tool.brush = {
      ...tool.brush,
      radius_m: 100,
      strength: 1,
      falloff: 'constant',
      spacing_pct: 25,
    };

    tool.onPointerDown({ x: 1000, y: 1000 }, mods);
    // 500 m percorridos ÷ (25% de 100 m) = 20 dabs ao longo do caminho
    tool.onPointerMove({ x: 1500, y: 1000 });
    tool.onPointerUp();

    // o meio do trajeto também recebeu dabs (não só as pontas)
    expect(ctx.world.terrain.getHeight(1250, 1000)).toBeGreaterThan(0);
  });

  it('undo desfaz o traço inteiro e devolve o terreno plano', () => {
    const ctx = makeContext();
    const tool = new SculptTool(ctx);
    tool.brush = { ...tool.brush, radius_m: 100, strength: 1, falloff: 'constant' };

    tool.onPointerDown({ x: 1000, y: 1000 }, mods);
    tool.onPointerMove({ x: 1400, y: 1000 });
    tool.onPointerUp();

    ctx.bus.undo();
    // tolerância = quantização do uint16 (precisão vertical ≈ 3 cm)
    expect(ctx.world.terrain.getHeight(1000, 1000)).toBeCloseTo(0, 1);
    expect(ctx.world.terrain.raster.allocatedTileCount).toBe(0);
  });

  it('flatten usa a altura do primeiro clique como alvo', () => {
    const ctx = makeContext();
    const tool = new SculptTool(ctx);

    // levanta um morro em (1000,1000)
    tool.brush = { ...tool.brush, mode: 'raise', radius_m: 200, strength: 1, falloff: 'constant' };
    tool.onPointerDown({ x: 1000, y: 1000 }, mods);
    tool.onPointerUp();
    const hill = ctx.world.terrain.getHeight(1000, 1000);
    expect(hill).toBeGreaterThan(0);

    // aplaina a partir de terreno plano (alvo 0 m) por cima do morro
    tool.brush = {
      ...tool.brush,
      mode: 'flatten',
      radius_m: 400,
      strength: 1,
      falloff: 'constant',
    };
    tool.onPointerDown({ x: 1400, y: 1000 }, mods); // clique em área plana
    tool.onPointerMove({ x: 1000, y: 1000 }); // arrasta sobre o morro
    tool.onPointerUp();
    expect(ctx.world.terrain.getHeight(1000, 1000)).toBeLessThan(hill);
  });

  it('lower rebaixa e clampa no fundo do range', () => {
    const ctx = makeContext();
    const tool = new SculptTool(ctx);
    tool.brush = { ...tool.brush, mode: 'lower', radius_m: 100, strength: 1, falloff: 'constant' };
    tool.onPointerDown({ x: 1000, y: 1000 }, mods);
    tool.onPointerUp();
    expect(ctx.world.terrain.getHeight(1000, 1000)).toBeLessThan(0);
  });

  it('pincel totalmente fora do mapa não emite comando', () => {
    const ctx = makeContext();
    const tool = new SculptTool(ctx);
    tool.brush = { ...tool.brush, radius_m: 100 };
    tool.onPointerDown({ x: -5000, y: -5000 }, mods);
    tool.onPointerUp();
    expect(ctx.bus.history.undoCount).toBe(0);
  });
});
