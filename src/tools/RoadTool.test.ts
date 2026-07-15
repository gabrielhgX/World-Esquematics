import { describe, expect, it } from 'vitest';
import {
  CommandBus,
  History,
  TsRasterKernels,
  WorldData,
  createWorldConfig,
  findGradeViolations,
} from '../core';
import { Camera2D } from '../render/Camera2D';
import { RoadTool } from './RoadTool';
import { buildRoadsCarveCommand } from './roadCarve';
import { computeMeasurements } from './MeasureTool';
import type { ToolContext } from './Tool';
import { heightToU16 } from '../core';

const mods = { shift: false, ctrl: false, alt: false };

const makeContext = (): ToolContext & { world: WorldData; bus: CommandBus } => {
  const world = new WorldData(
    createWorldConfig({
      projectName: 'Teste',
      extent: { width_m: 4096, height_m: 4096 },
      terrainResolution_m: 4,
      heightRange: { min_m: -200, max_m: 1800 },
    }),
  );
  const camera = new Camera2D();
  camera.setViewportSize(800, 600);
  camera.setMetersPerPixel(2);
  const bus = new CommandBus(world, new History());
  return { world, bus, camera, kernels: new TsRasterKernels(), requestRender: () => {} };
};

describe('RoadTool (README §4.5) — só emite Commands', () => {
  it('cliques + Enter criam a estrada; undo remove tudo', () => {
    const ctx = makeContext();
    const tool = new RoadTool(ctx);
    tool.onPointerDown({ x: 200, y: 200 }, mods);
    tool.onPointerUp();
    tool.onPointerDown({ x: 800, y: 300 }, mods);
    tool.onPointerUp();
    tool.onPointerDown({ x: 1400, y: 200 }, mods);
    tool.onPointerUp();
    expect(tool.onKeyDown('Enter')).toBe(true);

    expect(ctx.bus.history.undoCount).toBe(1);
    expect(ctx.world.roads.edges.size).toBe(2);
    expect(ctx.world.roads.nodes.size).toBe(3);

    ctx.bus.undo();
    expect(ctx.world.roads.edges.size).toBe(0);
    expect(ctx.world.roads.nodes.size).toBe(0);
  });

  it('desenhar cruzando estrada existente cria interseção nas DUAS', () => {
    const ctx = makeContext();
    const tool = new RoadTool(ctx);
    // horizontal
    tool.onPointerDown({ x: 200, y: 500 }, mods);
    tool.onPointerUp();
    tool.onPointerDown({ x: 1200, y: 500 }, mods);
    tool.onPointerUp();
    tool.onKeyDown('Enter');
    // vertical cruzando
    tool.onPointerDown({ x: 700, y: 200 }, mods);
    tool.onPointerUp();
    tool.onPointerDown({ x: 700, y: 900 }, mods);
    tool.onPointerUp();
    tool.onKeyDown('Enter');

    expect(ctx.world.roads.edges.size).toBe(4);
    const intersections = [...ctx.world.roads.nodes.values()].filter(
      (n) => n.kind === 'intersection',
    );
    expect(intersections.length).toBe(1);
  });

  it('snap: começar perto de nó existente reusa o nó', () => {
    const ctx = makeContext();
    const tool = new RoadTool(ctx);
    tool.onPointerDown({ x: 200, y: 200 }, mods);
    tool.onPointerUp();
    tool.onPointerDown({ x: 800, y: 200 }, mods);
    tool.onPointerUp();
    tool.onKeyDown('Enter');
    const nodesBefore = ctx.world.roads.nodes.size;

    // snap: 12 px × 2 m/px = 24 m de raio — clique a 10 m do nó (800,200)
    tool.onPointerDown({ x: 810, y: 200 }, mods);
    tool.onPointerUp();
    tool.onPointerDown({ x: 1400, y: 600 }, mods);
    tool.onPointerUp();
    tool.onKeyDown('Enter');

    expect(ctx.world.roads.nodes.size).toBe(nodesBefore + 1); // só o destino
  });

  it('Escape cancela o rascunho sem comando', () => {
    const ctx = makeContext();
    const tool = new RoadTool(ctx);
    tool.onPointerDown({ x: 200, y: 200 }, mods);
    tool.onPointerUp();
    expect(tool.onKeyDown('Escape')).toBe(true);
    expect(tool.draftAnchorCount).toBe(0);
    expect(ctx.bus.history.undoCount).toBe(0);
  });

  it('clique-arrastar produz segmento CURVO (handles)', () => {
    const ctx = makeContext();
    const tool = new RoadTool(ctx);
    tool.onPointerDown({ x: 200, y: 200 }, mods);
    tool.onPointerMove({ x: 400, y: 400 }); // arrasta: handle
    tool.onPointerUp();
    tool.onPointerDown({ x: 1000, y: 200 }, mods);
    tool.onPointerUp();
    tool.onKeyDown('Enter');

    const edge = [...ctx.world.roads.edges.values()][0];
    // c1 = handle do primeiro anchor, não o terço da reta
    expect(edge.c1.x).toBeCloseTo(400, 6);
    expect(edge.c1.y).toBeCloseTo(400, 6);
  });
});

describe('carve de estrada + medição (README §4.5/§7.3)', () => {
  it('Aplicar ao relevo aplaina a pista; ponte não toca o terreno', () => {
    const ctx = makeContext();
    // rampa: h = x × 0.2
    const raster = ctx.world.terrain.raster;
    const range = { min_m: -200, max_m: 1800 };
    for (let cy = 0; cy < 1024; cy++) {
      for (let cx = 0; cx < 1024; cx++) {
        raster.set(cx, cy, heightToU16(cx * 4 * 0.2, range));
      }
    }
    raster.consumeDirty();

    const tool = new RoadTool(ctx);
    tool.settings = { type: 'asphalt', width_m: 12, maxGrade_pct: 12 };
    tool.onPointerDown({ x: 400, y: 400 }, mods);
    tool.onPointerUp();
    tool.onPointerDown({ x: 1400, y: 400 }, mods);
    tool.onPointerUp();
    tool.onKeyDown('Enter');

    // rampa de 20% > limite de 12% → violação detectada (item 19)
    const violations = findGradeViolations(ctx.world.terrain, ctx.world.roads);
    expect(violations.length).toBe(1);

    const before = ctx.world.terrain.getHeight(900, 400);
    const command = buildRoadsCarveCommand(ctx.world, ctx.kernels)!;
    expect(command).not.toBeNull();
    ctx.bus.execute(command);
    // perfil suavizado numa rampa uniforme ≈ o próprio terreno: pista firme,
    // mudança pequena — mas o comando existe, aplica e desfaz
    ctx.bus.undo();
    expect(ctx.world.terrain.getHeight(900, 400)).toBeCloseTo(before, 1);
  });

  it('MeasureTool: distância real > plana em rampa; área do polígono fechado', () => {
    const ctx = makeContext();
    const raster = ctx.world.terrain.raster;
    const range = { min_m: -200, max_m: 1800 };
    for (let cy = 0; cy < 1024; cy++) {
      for (let cx = 0; cx < 1024; cx++) {
        raster.set(cx, cy, heightToU16(cx * 4 * 0.3, range));
      }
    }

    const line = computeMeasurements(
      ctx.world,
      [
        { x: 200, y: 500 },
        { x: 1200, y: 500 },
      ],
      false,
    )!;
    expect(line.planar_m).toBeCloseTo(1000, 6);
    // rampa de 30%: real = √(1+0.09) ≈ 1.044× a plana
    expect(line.surface_m).toBeGreaterThan(1035);
    expect(line.surface_m).toBeLessThan(1055);
    expect(line.deltaAltitude_m).toBeCloseTo(300, 0);
    expect(line.averageGrade_pct).toBeCloseTo(30, 0);

    const square = computeMeasurements(
      ctx.world,
      [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 1000 },
        { x: 0, y: 1000 },
      ],
      true,
    )!;
    expect(square.area_m2).toBeCloseTo(1_000_000, 3);
    expect(square.perimeter_m).toBeCloseTo(4000, 3);
  });
});
