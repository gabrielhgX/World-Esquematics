import {
  AddRiversCommand,
  FloodFillWaterCommand,
  SculptCommand,
  floodFillLake,
  heightToU16,
  newId,
  stampCellBounds,
  type BrushStamp,
  type RiverNode,
  type RiverSpline,
  type TileKey,
  type WaterBody,
} from '../core';
import type { Vec2 } from '../render/Camera2D';
import type { Modifiers, Tool, ToolContext } from './Tool';

/**
 * WaterTool (README §7.2):
 * - modo LAGO: clique + cota → flood → FloodFillWaterCommand com o polígono
 *   da borda;
 * - modo RIO: cliques adicionam nós; Enter conclui (valida cota decrescente,
 *   clampando — água não sobe), Esc cancela; opção de carvar o leito.
 */

export type WaterMode = 'lake' | 'river';

export interface WaterSettings {
  mode: WaterMode;
  /** cota absoluta da superfície do lago (m) */
  lakeSurface_m: number;
  riverWidth_m: number;
  carveBed: boolean;
  carveDepth_m: number;
}

export const DEFAULT_WATER_SETTINGS: WaterSettings = {
  mode: 'lake',
  lakeSurface_m: 10,
  riverWidth_m: 12,
  carveBed: true,
  carveDepth_m: 2,
};

export class WaterTool implements Tool {
  readonly cursor = 'crosshair';
  settings: WaterSettings = { ...DEFAULT_WATER_SETTINGS };

  private cursorPos: Vec2 | null = null;
  private draftNodes: RiverNode[] = [];

  constructor(private readonly ctx: ToolContext) {}

  onPointerDown(pt: Vec2, _mods: Modifiers): void {
    if (this.settings.mode === 'lake') {
      this.fillLake(pt);
    } else {
      this.addRiverNode(pt);
    }
  }

  onPointerMove(pt: Vec2): void {
    this.cursorPos = pt;
  }

  onPointerUp(): void {}

  onKeyDown(key: string): boolean {
    if (this.settings.mode !== 'river') return false;
    if (key === 'Enter') {
      this.finishRiver();
      return true;
    }
    if (key === 'Escape') {
      if (this.draftNodes.length === 0) return false;
      this.draftNodes = [];
      return true;
    }
    return false;
  }

  drawOverlay(ctx: CanvasRenderingContext2D): void {
    const camera = this.ctx.camera;

    // rascunho do rio em desenho
    if (this.draftNodes.length > 0) {
      ctx.strokeStyle = 'rgba(120, 190, 235, 0.9)';
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      this.draftNodes.forEach((node, i) => {
        const s = camera.worldToScreen(node);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      if (this.cursorPos) {
        const c = camera.worldToScreen(this.cursorPos);
        ctx.lineTo(c.x, c.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      for (const node of this.draftNodes) {
        const s = camera.worldToScreen(node);
        ctx.fillStyle = '#78bee9';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // cursor: gota (lago) ou mira (rio)
    if (this.cursorPos) {
      const s = camera.worldToScreen(this.cursorPos);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(s.x, s.y, this.settings.mode === 'lake' ? 7 : 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  clearCursor(): void {
    this.cursorPos = null;
  }

  get draftNodeCount(): number {
    return this.draftNodes.length;
  }

  /** clique + cota → priority-flood → WaterBody com polígono da borda (§7.2) */
  private fillLake(pt: Vec2): void {
    const { world, bus } = this.ctx;
    const result = floodFillLake(
      world.terrain,
      world.config.terrainResolution_m,
      pt,
      this.settings.lakeSurface_m,
    );
    if (!result || result.polygon.length < 3) return; // clique em terra seca

    const body: WaterBody = {
      id: newId(),
      kind: 'lake',
      surface_m: this.settings.lakeSurface_m,
      polygon: result.polygon,
      material: 'water_lake',
    };
    bus.execute(new FloodFillWaterCommand(body));
  }

  private addRiverNode(pt: Vec2): void {
    const { world } = this.ctx;
    const terrainHeight = world.terrain.getHeight(pt.x, pt.y);
    const previous = this.draftNodes[this.draftNodes.length - 1];
    // cota DEVE decrescer (README §4.3): clampa no nó anterior — água não sobe
    const surface_m = previous ? Math.min(previous.surface_m - 0.01, terrainHeight) : terrainHeight;
    this.draftNodes.push({
      x: pt.x,
      y: pt.y,
      width_m: this.settings.riverWidth_m,
      surface_m,
    });
  }

  private finishRiver(): void {
    if (this.draftNodes.length < 2) {
      this.draftNodes = [];
      return;
    }
    const river: RiverSpline = {
      id: newId(),
      nodes: this.draftNodes,
      carveDepth_m: this.settings.carveDepth_m,
    };
    this.draftNodes = [];

    const { bus } = this.ctx;
    bus.execute(new AddRiversCommand('Desenhar rio', [river]));
    // Carve é um comando EXPLÍCITO e separado (README §4.5: automático = o
    // usuário perde controle e o undo vira pesadelo) — aqui é opt-in.
    if (this.settings.carveBed) {
      bus.execute(this.buildCarveCommand(river));
    }
  }

  /** Rebaixa o leito ao longo da spline: cota do nó − carveDepth. */
  private buildCarveCommand(river: RiverSpline): SculptCommand {
    const { world, kernels } = this.ctx;
    const res = world.config.terrainResolution_m;
    const raster = world.terrain.raster;
    const range = world.config.heightRange;

    // amostra os segmentos a cada meia largura, interpolando cota/largura
    const stamps: Array<{ stamp: BrushStamp; target_u16: number }> = [];
    const tiles = new Set<TileKey>();
    for (let i = 1; i < river.nodes.length; i++) {
      const a = river.nodes[i - 1];
      const b = river.nodes[i];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const step = Math.max(res, Math.min(a.width_m, b.width_m) / 2);
      const count = Math.max(1, Math.ceil(length / step));
      for (let k = 0; k <= count; k++) {
        const t = k / count;
        const width = a.width_m + (b.width_m - a.width_m) * t;
        const surface = a.surface_m + (b.surface_m - a.surface_m) * t;
        const stamp: BrushStamp = {
          cx_cells: (a.x + (b.x - a.x) * t) / res,
          cy_cells: (a.y + (b.y - a.y) * t) / res,
          radius_cells: Math.max(1, width / 2 / res),
          strength: 1,
          falloff: 'smooth',
        };
        const bounds = stampCellBounds(raster, stamp);
        if (!bounds) continue;
        for (const key of raster.tilesInCellRect(bounds.x0, bounds.y0, bounds.x1, bounds.y1)) {
          tiles.add(key);
        }
        stamps.push({ stamp, target_u16: heightToU16(surface - river.carveDepth_m, range) });
      }
    }

    return new SculptCommand(
      'Carvar leito do rio',
      (r) => {
        for (const { stamp, target_u16 } of stamps) {
          kernels.applyCarve(r, stamp, target_u16);
        }
      },
      [...tiles],
    );
  }
}
