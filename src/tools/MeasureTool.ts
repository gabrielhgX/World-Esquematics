import type { WorldData } from '../core';
import type { Vec2 } from '../render/Camera2D';
import { formatAltitude, formatMeters } from '../render/format';
import type { Modifiers, Tool, ToolContext } from './Tool';

/**
 * MeasureTool (README §7.3): a ÚNICA ferramenta que não emite Command.
 * Distância plana e "real" (percorrendo o terreno — sempre maior), Δaltitude,
 * inclinação média/máxima em %; área e perímetro quando o polígono é fechado
 * com Enter. Esc limpa. O perfil de elevação (P3-3) mostra o CORTE do terreno
 * ao longo da linha — valida de relance se dá para passar estrada/rio.
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

/** Uma amostra do perfil: distância acumulada (plana) × cota. */
export interface ProfileSample {
  d_m: number;
  h_m: number;
}

/** Corte do terreno ao longo da polilinha (P3-3). */
export interface ElevationProfile {
  samples: ProfileSample[];
  min_m: number;
  max_m: number;
  /** distância plana total (perímetro, se fechado) */
  length_m: number;
}

/**
 * Amostra o relevo ao longo da polilinha, a cada célula (README §7.3). É a
 * PRIMITIVA: distância/inclinação e o gráfico saem todos daqui — uma varredura
 * só, sem reamostrar o terreno duas vezes.
 */
export function sampleElevationProfile(
  world: WorldData,
  points: Vec2[],
  closed: boolean,
): ElevationProfile | null {
  if (points.length < 2) return null;
  const path = closed ? [...points, points[0]] : points;
  const step = Math.max(world.config.terrainResolution_m, 1);

  const samples: ProfileSample[] = [];
  let min = Infinity;
  let max = -Infinity;
  let d = 0;
  const push = (dist_m: number, x: number, y: number) => {
    const h = world.terrain.getHeight(x, y);
    samples.push({ d_m: dist_m, h_m: h });
    if (h < min) min = h;
    if (h > max) max = h;
  };

  push(0, path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist < 1e-9) continue;
    const n = Math.max(1, Math.ceil(dist / step));
    for (let s = 1; s <= n; s++) {
      const t = s / n;
      push(d + dist * t, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    }
    d += dist;
  }

  return { samples, min_m: min, max_m: max, length_m: d };
}

/** Deriva as medidas escalares de um perfil já amostrado. */
export function measurementsFromProfile(
  profile: ElevationProfile,
  world: WorldData,
  points: Vec2[],
  closed: boolean,
): Measurements {
  const { samples } = profile;
  const planar = profile.length_m;
  let surface = 0;
  let maxGrade = 0;
  for (let i = 1; i < samples.length; i++) {
    const dd = samples[i].d_m - samples[i - 1].d_m;
    if (dd < 1e-12) continue;
    const dh = samples[i].h_m - samples[i - 1].h_m;
    surface += Math.sqrt(dd * dd + dh * dh);
    const grade = (Math.abs(dh) / dd) * 100;
    if (grade > maxGrade) maxGrade = grade;
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

/** Função pura para testes: mede a polilinha sobre o mundo. */
export function computeMeasurements(
  world: WorldData,
  points: Vec2[],
  closed: boolean,
): Measurements | null {
  const profile = sampleElevationProfile(world, points, closed);
  if (!profile) return null;
  return measurementsFromProfile(profile, world, points, closed);
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
    const profile = sampleElevationProfile(this.ctx.world, livePoints, this.closed);
    if (!profile) return;
    const m = measurementsFromProfile(profile, this.ctx.world, livePoints, this.closed);
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
    const textW = Math.max(...lines.map((l) => overlay.measureText(l).width));
    const showChart = profile.samples.length >= 2 && profile.length_m > 0;
    const chartH = showChart ? 58 : 0;
    const boxW = Math.max(textW, showChart ? 200 : 0) + 12;
    const textH = lines.length * 15 + 8;
    const boxX = anchor.x + 10;
    const boxY = anchor.y - 8;
    overlay.fillStyle = 'rgba(20, 22, 24, 0.88)';
    overlay.fillRect(boxX, boxY, boxW, textH + chartH);
    overlay.fillStyle = '#d6e9dd';
    lines.forEach((line, i) => {
      overlay.fillText(line, boxX + 6, boxY + 12 + i * 15);
    });
    if (showChart) this.drawProfile(overlay, profile, boxX + 6, boxY + textH, boxW - 12, chartH - 10);
  }

  /**
   * Perfil de elevação (P3-3): o corte do terreno ao longo da linha — cota ×
   * distância. Silhueta preenchida + linha, com a referência do mar quando o
   * oceano está ligado. Série única, então sem legenda: o gráfico É a linha
   * medida (mesma cor de acento).
   */
  private drawProfile(
    ctx: CanvasRenderingContext2D,
    profile: ElevationProfile,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const { samples, length_m } = profile;
    // faixa vertical com margem; terreno plano não pode dividir por zero
    let lo = profile.min_m;
    let hi = profile.max_m;
    if (hi - lo < 1) {
      lo -= 0.5;
      hi += 0.5;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
    const sx = (d: number) => x + (d / length_m) * w;
    const sy = (hh: number) => y + h - ((hh - lo) / (hi - lo)) * h;

    // silhueta preenchida (o corte do terreno), ancorada na base
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    for (const s of samples) ctx.lineTo(sx(s.d_m), sy(s.h_m));
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(110, 231, 183, 0.16)';
    ctx.fill();

    // referência do mar: valida de relance se o traçado mergulha
    if (this.ctx.world.water.oceanEnabled) {
      const sea = this.ctx.world.water.seaLevel_m;
      if (sea > lo && sea < hi) {
        const yy = sy(sea);
        ctx.strokeStyle = 'rgba(96, 165, 220, 0.75)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, yy);
        ctx.lineTo(x + w, yy);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // a linha do perfil (mesmo acento da régua)
    ctx.beginPath();
    samples.forEach((s, i) => {
      const px = sx(s.d_m);
      const py = sy(s.h_m);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = '#6ee7b7';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // rótulos de cota (topo/base reais, sem a margem)
    ctx.fillStyle = 'rgba(214, 233, 221, 0.65)';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText(formatAltitude(profile.max_m), x + 1, y + 8);
    ctx.fillText(formatAltitude(profile.min_m), x + 1, y + h - 1);
  }
}
