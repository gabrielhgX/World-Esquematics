import {
  SculptCommand,
  heightToU16,
  stampCellBounds,
  U16_MAX,
  type BrushStamp,
  type FalloffKind,
} from '../core';
import type { Vec2 } from '../render/Camera2D';
import type { Modifiers, Tool, ToolContext } from './Tool';

/**
 * SculptTool (README §7.1): raise / lower / smooth / flatten, com falloff e
 * spacing. Cada dab vira um SculptCommand executado com coalesce — o traço
 * inteiro é UM comando no histórico (abre no pointerdown, sela no pointerup).
 */

export type SculptMode = 'raise' | 'lower' | 'smooth' | 'flatten';

export interface BrushSettings {
  mode: SculptMode;
  radius_m: number;
  /** [0..1] */
  strength: number;
  falloff: FalloffKind;
  /** reaplicação a cada X% do raio ao arrastar — impede que um mouse lento
   * cave um poço vertical (README §7.1) */
  spacing_pct: number;
}

export const DEFAULT_BRUSH: BrushSettings = {
  mode: 'raise',
  radius_m: 300,
  strength: 0.5,
  falloff: 'smooth',
  spacing_pct: 25,
};

/** metros somados por dab no centro do pincel, com strength = 1 */
const RAISE_M_PER_DAB = 3;

const MODE_LABELS: Record<SculptMode, string> = {
  raise: 'Esculpir — elevar',
  lower: 'Esculpir — rebaixar',
  smooth: 'Esculpir — suavizar',
  flatten: 'Esculpir — aplainar',
};

export class SculptTool implements Tool {
  readonly cursor = 'crosshair';
  brush: BrushSettings = { ...DEFAULT_BRUSH };

  private stroking = false;
  private lastDab: Vec2 | null = null;
  private cursorPos: Vec2 | null = null;
  /** alvo do flatten: altura do primeiro clique (README §7.1) */
  private flattenTarget_u16 = 0;

  constructor(private readonly ctx: ToolContext) {}

  onPointerDown(pt: Vec2, _mods: Modifiers): void {
    if (this.ctx.world.terrain.locked) return; // Outliner: camada travada
    this.stroking = true;
    if (this.brush.mode === 'flatten') {
      const range = this.ctx.world.config.heightRange;
      this.flattenTarget_u16 = heightToU16(this.ctx.world.terrain.getHeight(pt.x, pt.y), range);
    }
    this.dab(pt);
    this.lastDab = pt;
  }

  onPointerMove(pt: Vec2): void {
    this.cursorPos = pt;
    if (!this.stroking || !this.lastDab) return;

    // Spacing: um dab a cada X% do raio percorrido, interpolando o trajeto
    // para que arrastes rápidos não deixem buracos.
    const spacing_m = Math.max((this.brush.spacing_pct / 100) * this.brush.radius_m, 0.01);
    let dx = pt.x - this.lastDab.x;
    let dy = pt.y - this.lastDab.y;
    let dist = Math.hypot(dx, dy);
    while (dist >= spacing_m) {
      const step = spacing_m / dist;
      this.lastDab = {
        x: this.lastDab.x + dx * step,
        y: this.lastDab.y + dy * step,
      };
      this.dab(this.lastDab);
      dx = pt.x - this.lastDab.x;
      dy = pt.y - this.lastDab.y;
      dist = Math.hypot(dx, dy);
    }
  }

  onPointerUp(): void {
    if (!this.stroking) return;
    this.stroking = false;
    this.lastDab = null;
    this.ctx.bus.sealCoalescing(); // fecha o traço: próximo arraste = novo comando
  }

  drawOverlay(overlay: CanvasRenderingContext2D): void {
    if (!this.cursorPos) return;
    const center = this.ctx.camera.worldToScreen(this.cursorPos);
    const radiusPx = this.brush.radius_m / this.ctx.camera.metersPerPixel;

    overlay.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    overlay.lineWidth = 1.25;
    overlay.beginPath();
    overlay.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
    overlay.stroke();

    if (this.brush.falloff !== 'constant') {
      overlay.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      overlay.setLineDash([4, 4]);
      overlay.beginPath();
      overlay.arc(center.x, center.y, radiusPx / 2, 0, Math.PI * 2);
      overlay.stroke();
      overlay.setLineDash([]);
    }
  }

  /** Ponto do cursor deixou o viewport. */
  clearCursor(): void {
    this.cursorPos = null;
  }

  private dab(pt: Vec2): void {
    const { world, bus, kernels } = this.ctx;
    const res = world.config.terrainResolution_m;
    const raster = world.terrain.raster;

    const stamp: BrushStamp = {
      cx_cells: pt.x / res,
      cy_cells: pt.y / res,
      radius_cells: this.brush.radius_m / res,
      strength: this.brush.strength,
      falloff: this.brush.falloff,
    };
    const bounds = stampCellBounds(raster, stamp);
    if (!bounds) return; // pincel inteiro fora do mapa
    const tiles = raster.tilesInCellRect(bounds.x0, bounds.y0, bounds.x1, bounds.y1);

    const range = world.config.heightRange;
    const amount_u16 = (RAISE_M_PER_DAB / (range.max_m - range.min_m)) * U16_MAX;
    const mode = this.brush.mode;
    const target = this.flattenTarget_u16;

    const operation = (r: typeof raster): void => {
      switch (mode) {
        case 'raise':
          kernels.applyRaise(r, stamp, amount_u16);
          break;
        case 'lower':
          kernels.applyRaise(r, stamp, -amount_u16);
          break;
        case 'smooth':
          kernels.applySmooth(r, stamp);
          break;
        case 'flatten':
          kernels.applyFlatten(r, stamp, target);
          break;
      }
    };

    bus.execute(new SculptCommand(MODE_LABELS[mode], operation, tiles), { coalesce: true });
  }
}
