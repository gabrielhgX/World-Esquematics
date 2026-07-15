import { RoadGraphCommand, planRoadPath, type RoadSegmentSpec, type RoadType } from '../core';
import type { Vec2 } from '../render/Camera2D';
import { BezierDraft } from './BezierDraft';
import type { Modifiers, Tool, ToolContext } from './Tool';

/**
 * RoadTool (README §4.5/§11 item 18): desenha splines no grafo planar com
 * snap a nó e split automático em interseções. Clique = nó de canto;
 * clique-arrastar = nó suave com handles; Enter conclui; Esc cancela.
 */

export interface RoadSettings {
  type: RoadType;
  width_m: number;
  maxGrade_pct: number;
}

export const DEFAULT_ROAD_SETTINGS: RoadSettings = {
  type: 'dirt',
  width_m: 8,
  maxGrade_pct: 12,
};

/** raio de snap em pixels de tela */
const SNAP_RADIUS_PX = 12;

export class RoadTool implements Tool {
  readonly cursor = 'crosshair';
  settings: RoadSettings = { ...DEFAULT_ROAD_SETTINGS };

  private readonly draft = new BezierDraft();
  private cursorPos: Vec2 | null = null;

  constructor(private readonly ctx: ToolContext) {}

  onPointerDown(pt: Vec2, _mods: Modifiers): void {
    const snapped = this.snapNode(pt);
    this.draft.begin(snapped ? snapped.pos : pt, snapped?.id ?? null);
  }

  onPointerMove(pt: Vec2): void {
    this.cursorPos = pt;
    this.draft.shape(pt);
  }

  onPointerUp(): void {
    this.draft.end();
  }

  onKeyDown(key: string): boolean {
    if (key === 'Enter') {
      this.finish();
      return true;
    }
    if (key === 'Escape' && !this.draft.isEmpty) {
      this.draft.cancel();
      return true;
    }
    return false;
  }

  drawOverlay(overlay: CanvasRenderingContext2D): void {
    const camera = this.ctx.camera;
    this.draft.drawOverlay(overlay, camera, this.cursorPos, '#e0b56b');

    // indicador de snap sob o cursor
    if (this.cursorPos) {
      const snapped = this.snapNode(this.cursorPos);
      if (snapped) {
        const s = camera.worldToScreen(snapped.pos);
        overlay.strokeStyle = '#ffd166';
        overlay.lineWidth = 1.5;
        overlay.beginPath();
        overlay.arc(s.x, s.y, 7, 0, Math.PI * 2);
        overlay.stroke();
      }
    }
  }

  clearCursor(): void {
    this.cursorPos = null;
  }

  get draftAnchorCount(): number {
    return this.draft.anchors.length;
  }

  private snapNode(pt: Vec2) {
    const radius_m = SNAP_RADIUS_PX * this.ctx.camera.metersPerPixel;
    return this.ctx.world.roads.nearestNode(pt, radius_m);
  }

  private finish(): void {
    const anchors = this.draft.anchors;
    if (anchors.length < 2) {
      this.draft.cancel();
      return;
    }
    const segments = this.draft.segments();
    const specs: RoadSegmentSpec[] = segments.map((segment, i) => ({
      fromNodeId: anchors[i].snappedNodeId,
      fromPos: anchors[i].pos,
      toNodeId: anchors[i + 1].snappedNodeId,
      toPos: anchors[i + 1].pos,
      c1: segment.c1,
      c2: segment.c2,
    }));
    this.draft.cancel();

    const isBridge = this.settings.type === 'bridge';
    const plan = planRoadPath(this.ctx.world.roads, specs, {
      width_m: this.settings.width_m,
      type: this.settings.type,
      material: `road_${this.settings.type}`,
      // ponte ignora o relevo: não carva, mantém cota (README §4.5)
      carveTerrain: !isBridge,
      maxGrade_pct: this.settings.maxGrade_pct,
    });
    this.ctx.bus.execute(new RoadGraphCommand('Desenhar estrada', plan));
  }
}
