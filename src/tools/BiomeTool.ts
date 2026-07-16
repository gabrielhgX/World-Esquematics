import { AddBiomePolygonCommand, createBiomePolygon } from '../core';
import type { Vec2 } from '../render/Camera2D';
import type { Modifiers, Tool, ToolContext } from './Tool';

/**
 * BiomeTool (README §4.4): pinta biomas por POLÍGONO (autoria vetorial,
 * editável, limpa) — o raster uint8 é derivado. Cliques desenham; Enter
 * fecha; Esc cancela.
 */

export interface BiomeSettings {
  biomeId: number;
  featherRadius_m: number;
}

export const DEFAULT_BIOME_SETTINGS: BiomeSettings = {
  biomeId: 1,
  featherRadius_m: 16,
};

export class BiomeTool implements Tool {
  readonly cursor = 'crosshair';
  settings: BiomeSettings = { ...DEFAULT_BIOME_SETTINGS };

  private vertices: Array<[number, number]> = [];
  private cursorPos: Vec2 | null = null;

  constructor(private readonly ctx: ToolContext) {}

  onPointerDown(pt: Vec2, _mods: Modifiers): void {
    if (this.ctx.world.biomes.locked) return; // Outliner: camada travada
    this.vertices.push([pt.x, pt.y]);
  }

  onPointerMove(pt: Vec2): void {
    this.cursorPos = pt;
  }

  onPointerUp(): void {}

  onKeyDown(key: string): boolean {
    if (key === 'Enter') {
      this.finish();
      return true;
    }
    if (key === 'Escape' && this.vertices.length > 0) {
      this.vertices = [];
      return true;
    }
    return false;
  }

  drawOverlay(overlay: CanvasRenderingContext2D): void {
    if (this.vertices.length === 0) return;
    const color = this.ctx.world.biomes.getBiome(this.settings.biomeId)?.color ?? '#888888';
    const camera = this.ctx.camera;
    overlay.strokeStyle = color;
    overlay.fillStyle = `${color}30`;
    overlay.setLineDash([6, 4]);
    overlay.lineWidth = 1.5;
    overlay.beginPath();
    this.vertices.forEach(([x, y], i) => {
      const s = camera.worldToScreen({ x, y });
      if (i === 0) overlay.moveTo(s.x, s.y);
      else overlay.lineTo(s.x, s.y);
    });
    if (this.cursorPos) {
      const c = camera.worldToScreen(this.cursorPos);
      overlay.lineTo(c.x, c.y);
    }
    overlay.closePath();
    overlay.fill();
    overlay.stroke();
    overlay.setLineDash([]);
  }

  get vertexCount(): number {
    return this.vertices.length;
  }

  private finish(): void {
    if (this.vertices.length < 3) {
      this.vertices = [];
      return;
    }
    const polygon = this.vertices;
    this.vertices = [];
    this.ctx.bus.execute(
      new AddBiomePolygonCommand(
        createBiomePolygon(this.settings.biomeId, polygon, this.settings.featherRadius_m),
      ),
    );
  }
}
