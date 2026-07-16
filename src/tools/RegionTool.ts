import { AddRegionCommand, newId, type PolygonRing } from '../core';
import type { Vec2 } from '../render/Camera2D';
import type { Modifiers, Tool, ToolContext } from './Tool';

/** RegionTool (README §4.6): cliques desenham o polígono; Enter fecha. */

export interface RegionSettings {
  name: string;
  color: string;
}

export const DEFAULT_REGION_SETTINGS: RegionSettings = {
  name: 'Nova região',
  color: '#b06ab0',
};

export class RegionTool implements Tool {
  readonly cursor = 'crosshair';
  settings: RegionSettings = { ...DEFAULT_REGION_SETTINGS };

  private vertices: Array<[number, number]> = [];
  private cursorPos: Vec2 | null = null;

  constructor(private readonly ctx: ToolContext) {}

  onPointerDown(pt: Vec2, _mods: Modifiers): void {
    if (this.ctx.world.regions.locked) return; // Outliner: camada travada
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
    const camera = this.ctx.camera;
    overlay.strokeStyle = this.settings.color;
    overlay.fillStyle = `${this.settings.color}30`;
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
    const polygon: PolygonRing = this.vertices;
    this.vertices = [];
    this.ctx.bus.execute(
      new AddRegionCommand({
        id: newId(),
        name: this.settings.name,
        description: '',
        polygon,
        color: this.settings.color,
        properties: {},
      }),
    );
  }
}
