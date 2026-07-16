import { AddPOICommand, newId } from '../core';
import type { Vec2 } from '../render/Camera2D';
import type { Modifiers, Tool, ToolContext } from './Tool';

/** POITool (README §4.6): clique posiciona um ponto de interesse. */

export interface POISettings {
  name: string;
  icon: string;
}

export const DEFAULT_POI_SETTINGS: POISettings = {
  name: 'Local',
  icon: '★',
};

export class POITool implements Tool {
  readonly cursor = 'crosshair';
  settings: POISettings = { ...DEFAULT_POI_SETTINGS };

  private cursorPos: Vec2 | null = null;

  constructor(private readonly ctx: ToolContext) {}

  onPointerDown(pt: Vec2, _mods: Modifiers): void {
    if (this.ctx.world.pois.locked) return; // Outliner: camada travada
    this.ctx.bus.execute(
      new AddPOICommand({
        id: newId(),
        name: this.settings.name,
        icon: this.settings.icon,
        pos: { x: pt.x, y: pt.y },
        properties: {},
      }),
    );
  }

  onPointerMove(pt: Vec2): void {
    this.cursorPos = pt;
  }

  onPointerUp(): void {}

  drawOverlay(overlay: CanvasRenderingContext2D): void {
    if (!this.cursorPos) return;
    const s = this.ctx.camera.worldToScreen(this.cursorPos);
    overlay.font = '14px system-ui, sans-serif';
    overlay.textAlign = 'center';
    overlay.textBaseline = 'middle';
    overlay.globalAlpha = 0.7;
    overlay.fillStyle = '#fff';
    overlay.fillText(this.settings.icon, s.x, s.y);
    overlay.globalAlpha = 1;
    overlay.textAlign = 'start';
  }
}
