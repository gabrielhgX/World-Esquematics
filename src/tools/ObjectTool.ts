import { AddObjectCommand, newId } from '../core';
import type { Vec2 } from '../render/Camera2D';
import type { Modifiers, Tool, ToolContext } from './Tool';

/**
 * ObjectTool (README §4.6): clique posiciona um objeto MANUAL.
 * Z é derivado do terreno (z_offset_m relativo) — nunca armazenado.
 */

export interface ObjectSettings {
  type: string;
  alignToSlope: boolean;
}

export const DEFAULT_OBJECT_SETTINGS: ObjectSettings = {
  type: 'house_medieval_01',
  alignToSlope: false,
};

export const OBJECT_TYPE_PRESETS = [
  'house_medieval_01',
  'tower_01',
  'pine_tree_01',
  'oak_tree_01',
  'bush_01',
  'rock_01',
];

export class ObjectTool implements Tool {
  readonly cursor = 'crosshair';
  settings: ObjectSettings = { ...DEFAULT_OBJECT_SETTINGS };

  private cursorPos: Vec2 | null = null;

  constructor(private readonly ctx: ToolContext) {}

  onPointerDown(pt: Vec2, _mods: Modifiers): void {
    this.ctx.bus.execute(
      new AddObjectCommand({
        id: newId(),
        type: this.settings.type,
        pos: { x: pt.x, y: pt.y },
        z_offset_m: 0,
        rotation_deg: 0,
        scale: { x: 1, y: 1, z: 1 },
        alignToSlope: this.settings.alignToSlope,
        tags: [],
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
    overlay.strokeStyle = 'rgba(255,255,255,0.7)';
    overlay.lineWidth = 1.25;
    overlay.strokeRect(s.x - 6, s.y - 6, 12, 12);
  }
}
