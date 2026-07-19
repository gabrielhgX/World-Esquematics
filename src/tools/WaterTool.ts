import {
  AddRiversCommand,
  FloodFillWaterCommand,
  SculptCommand,
  basinSpillLevel,
  floodFillLake,
  heightToU16,
  newId,
  stampCellBounds,
  type BrushStamp,
  type PolygonRing,
  type RiverNode,
  type RiverSpline,
  type TileKey,
  type WaterBody,
} from '../core';
import type { Vec2 } from '../render/Camera2D';
import type { Modifiers, Tool, ToolContext } from './Tool';

/**
 * WaterTool (README §7.2):
 * - modo LAGO: pressione numa depressão e a água JORRA do fundo para cima,
 *   enchendo a bacia CONTIDA pelo relevo (não alaga a planície). Segure para
 *   subir o nível até o transbordo; solte para selar. Sem cota absoluta —
 *   quem manda no nível é o próprio relevo;
 * - modo RIO: cliques adicionam nós; Enter conclui (valida cota decrescente,
 *   clampando — água não sobe), Esc cancela; opção de carvar o leito.
 */

export type WaterMode = 'lake' | 'river';

export interface WaterSettings {
  mode: WaterMode;
  riverWidth_m: number;
  carveBed: boolean;
  carveDepth_m: number;
}

export const DEFAULT_WATER_SETTINGS: WaterSettings = {
  mode: 'lake',
  riverWidth_m: 12,
  carveBed: true,
  carveDepth_m: 2,
};

/** tempo para encher a bacia do fundo ao transbordo, segurando (ms) */
const FILL_DURATION_MS = 1600;
/** um toque rápido ainda enche este tanto da bacia */
const MIN_FILL_FRACTION = 0.25;

/** Lago enchendo ao vivo (preview até soltar o botão). */
interface LakeFill {
  seed: Vec2;
  spill_m: number;
  bottom_m: number;
  level_m: number;
  polygon: PolygonRing | null;
}

export class WaterTool implements Tool {
  readonly cursor = 'crosshair';
  settings: WaterSettings = { ...DEFAULT_WATER_SETTINGS };

  private cursorPos: Vec2 | null = null;
  private draftNodes: RiverNode[] = [];
  private fill: LakeFill | null = null;

  constructor(private readonly ctx: ToolContext) {}

  onPointerDown(pt: Vec2, _mods: Modifiers): void {
    if (this.ctx.world.water.locked) return; // Outliner: camada travada
    if (this.settings.mode === 'lake') {
      this.startFill(pt);
    } else {
      this.addRiverNode(pt);
    }
  }

  onPointerMove(pt: Vec2): void {
    this.cursorPos = pt;
  }

  /** Enquanto o botão está pressionado, o nível sobe — a água "jorra". */
  onHold(dt_ms: number): void {
    if (!this.fill) return;
    const span = Math.max(this.fill.spill_m - this.fill.bottom_m, 0.5);
    this.fill.level_m = Math.min(
      this.fill.spill_m,
      this.fill.level_m + (span / FILL_DURATION_MS) * dt_ms,
    );
    this.recomputeFillPolygon();
  }

  onPointerUp(): void {
    if (this.settings.mode !== 'lake' || !this.fill) return;
    this.commitFill();
  }

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

    // lago enchendo ao vivo (preview do jorro)
    if (this.fill?.polygon) {
      ctx.fillStyle = 'rgba(70, 130, 180, 0.5)';
      ctx.strokeStyle = 'rgba(120, 190, 235, 0.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      this.fill.polygon.forEach(([x, y], i) => {
        const s = camera.worldToScreen({ x, y });
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

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

  /** Pressionar numa depressão: a água começa a jorrar do fundo (§7.2). */
  private startFill(pt: Vec2): void {
    const { world } = this.ctx;
    const basin = basinSpillLevel(world.terrain, world.config.terrainResolution_m, pt);
    if (!basin) {
      this.fill = null; // clique em encosta/planície: não há bacia para encher
      return;
    }
    this.fill = {
      // jorra a partir do FUNDO da bacia, não de onde o clique caiu
      seed: basin.bottomSeed,
      spill_m: basin.spill_m,
      bottom_m: basin.bottom_m,
      level_m: basin.bottom_m,
      polygon: null,
    };
  }

  /** Recalcula o contorno do lago no nível atual (contido: nível ≤ transbordo). */
  private recomputeFillPolygon(): void {
    if (!this.fill) return;
    const res = this.ctx.world.config.terrainResolution_m;
    const result = floodFillLake(this.ctx.world.terrain, res, this.fill.seed, this.fill.level_m);
    this.fill.polygon = result && result.polygon.length >= 3 ? result.polygon : null;
  }

  /** Solta o botão: sela o lago no nível alcançado (um toque enche o mínimo). */
  private commitFill(): void {
    const fill = this.fill;
    this.fill = null;
    if (!fill) return;
    const res = this.ctx.world.config.terrainResolution_m;
    const minLevel = fill.bottom_m + (fill.spill_m - fill.bottom_m) * MIN_FILL_FRACTION;
    const level = Math.min(fill.spill_m, Math.max(fill.level_m, minLevel));
    const result = floodFillLake(this.ctx.world.terrain, res, fill.seed, level);
    if (!result || result.polygon.length < 3) return;

    const body: WaterBody = {
      id: newId(),
      kind: 'lake',
      surface_m: level,
      polygon: result.polygon,
      material: 'water_lake',
    };
    this.ctx.bus.execute(new FloodFillWaterCommand(body));
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
