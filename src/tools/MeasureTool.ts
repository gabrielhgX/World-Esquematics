import type { WorldData } from '../core';
import type { Vec2 } from '../render/Camera2D';
import { formatMeters } from '../render/format';
import type { Modifiers, Tool, ToolContext } from './Tool';

/**
 * MeasureTool (README §7.3): a ÚNICA ferramenta que não emite Command.
 * Distância plana e "real" (percorrendo o terreno — sempre maior), Δaltitude,
 * inclinação média/máxima em %; área e perímetro quando o polígono é fechado
 * com Enter. Esc limpa.
 */

export interface Measurements {
  planar_m: number;
  /** distância percorrendo o relevo (≥ planar) */
  surface_m: number;
  deltaAltitude_m: number;
  averageGrade_pct: number;
  maxGrade_pct: number;
  /** presentes apenas com o polígono fechado */
  area_m2: number | null;
  perimeter_m: number | null;
}

/** Função pura para testes: mede a polilinha sobre o mundo. */
export function computeMeasurements(
  world: WorldData,
  points: Vec2[],
  closed: boolean,
): Measurements | null {
  if (points.length < 2) return null;
  const path = closed ? [...points, points[0]] : points;
  const step = Math.max(world.config.terrainResolution_m, 1);

  let planar = 0;
  let surface = 0;
  let maxGrade = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist < 1e-9) continue;
    planar += dist;
    const samples = Math.max(1, Math.ceil(dist / step));
    let previousHeight = world.terrain.getHeight(a.x, a.y);
    for (let s = 1; s <= samples; s++) {
      const t = s / samples;
      const height = world.terrain.getHeight(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      const d = dist / samples;
      const dh = height - previousHeight;
      surface += Math.sqrt(d * d + dh * dh);
      const grade = (Math.abs(dh) / d) * 100;
      if (grade > maxGrade) maxGrade = grade;
      previousHeight = height;
    }
  }

  const h0 = world.terrain.getHeight(points[0].x, points[0].y);
  const h1 = world.terrain.getHeight(points[points.length - 1].x, points[points.length - 1].y);
  const deltaAltitude = h1 - h0;

  let area: number | null = null;
  let perimeter: number | null = null;
  if (closed && points.length >= 3) {
    let shoelace = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      shoelace += points[j].x * points[i].y - points[i].x * points[j].y;
    }
    area = Math.abs(shoelace) / 2;
    perimeter = planar;
  }

  return {
    planar_m: planar,
    surface_m: surface,
    deltaAltitude_m: deltaAltitude,
    averageGrade_pct: planar > 0 ? (Math.abs(deltaAltitude) / planar) * 100 : 0,
    maxGrade_pct: maxGrade,
    area_m2: area,
    perimeter_m: perimeter,
  };
}

export class MeasureTool implements Tool {
  readonly cursor = 'crosshair';

  private points: Vec2[] = [];
  private closed = false;
  private cursorPos: Vec2 | null = null;

  constructor(private readonly ctx: ToolContext) {}

  onPointerDown(pt: Vec2, _mods: Modifiers): void {
    if (this.closed) {
      this.points = [];
      this.closed = false;
    }
    this.points.push(pt);
  }

  onPointerMove(pt: Vec2): void {
    this.cursorPos = pt;
  }

  onPointerUp(): void {}

  onKeyDown(key: string): boolean {
    if (key === 'Enter' && this.points.length >= 3) {
      this.closed = true;
      return true;
    }
    if (key === 'Escape' && this.points.length > 0) {
      this.points = [];
      this.closed = false;
      return true;
    }
    return false;
  }

  get pointCount(): number {
    return this.points.length;
  }

  drawOverlay(overlay: CanvasRenderingContext2D): void {
    if (this.points.length === 0) return;
    const camera = this.ctx.camera;

    overlay.strokeStyle = '#6ee7b7';
    overlay.lineWidth = 1.5;
    overlay.setLineDash([2, 3]);
    overlay.beginPath();
    this.points.forEach((pt, i) => {
      const s = camera.worldToScreen(pt);
      if (i === 0) overlay.moveTo(s.x, s.y);
      else overlay.lineTo(s.x, s.y);
    });
    if (this.closed) overlay.closePath();
    else if (this.cursorPos) {
      const c = camera.worldToScreen(this.cursorPos);
      overlay.lineTo(c.x, c.y);
    }
    overlay.stroke();
    overlay.setLineDash([]);
    for (const pt of this.points) {
      const s = camera.worldToScreen(pt);
      overlay.fillStyle = '#6ee7b7';
      overlay.fillRect(s.x - 2.5, s.y - 2.5, 5, 5);
    }

    // caixa de medidas ao lado do último ponto
    const livePoints =
      !this.closed && this.cursorPos ? [...this.points, this.cursorPos] : this.points;
    const m = computeMeasurements(this.ctx.world, livePoints, this.closed);
    if (!m) return;
    const lines = [
      `plana ${formatMeters(m.planar_m)} · real ${formatMeters(m.surface_m)}`,
      `Δalt ${formatMeters(m.deltaAltitude_m)} · incl méd ${m.averageGrade_pct.toFixed(1)}% · máx ${m.maxGrade_pct.toFixed(1)}%`,
    ];
    if (m.area_m2 !== null) {
      lines.push(
        `área ${(m.area_m2 / 1e6).toFixed(3)} km² · perímetro ${formatMeters(m.perimeter_m!)}`,
      );
    }
    const anchor = camera.worldToScreen(livePoints[livePoints.length - 1]);
    overlay.font = '11px system-ui, sans-serif';
    const width = Math.max(...lines.map((l) => overlay.measureText(l).width)) + 12;
    overlay.fillStyle = 'rgba(20, 22, 24, 0.85)';
    overlay.fillRect(anchor.x + 10, anchor.y - 8, width, lines.length * 15 + 8);
    overlay.fillStyle = '#d6e9dd';
    lines.forEach((line, i) => {
      overlay.fillText(line, anchor.x + 16, anchor.y + 4 + i * 15);
    });
  }
}
