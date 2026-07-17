import type { Camera2D } from '../Camera2D';
import { formatRulerMeters } from '../format';

/**
 * Réguas em metros (README Fase 0, entregável): topo = X/Leste,
 * esquerda = Y/Norte. Derivado do estado da câmera — nunca persiste (D6).
 */

export const RULER_THICKNESS_PX = 24;

const TARGET_LABEL_SPACING_PX = 90;
const COLORS = {
  background: '#232528',
  border: '#3a3d42',
  tick: '#5a5e64',
  text: '#a5abb3',
};

/** Menor passo "bonito" (1–2–5 × 10^n) que resulta em rótulos ≥ `raw`. */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const mult of [1, 2, 5]) {
    if (mult * pow >= raw) return mult * pow;
  }
  return 10 * pow;
}

export class RulerOverlay {
  draw(ctx: CanvasRenderingContext2D, camera: Camera2D, widthPx: number, heightPx: number): void {
    const step = niceStep(camera.metersPerPixel * TARGET_LABEL_SPACING_PX);
    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    this.drawTopRuler(ctx, camera, widthPx, step);
    this.drawLeftRuler(ctx, camera, heightPx, step);
    this.drawCorner(ctx);
  }

  private drawTopRuler(
    ctx: CanvasRenderingContext2D,
    camera: Camera2D,
    widthPx: number,
    step: number,
  ): void {
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, widthPx, RULER_THICKNESS_PX);
    ctx.strokeStyle = COLORS.border;
    ctx.beginPath();
    ctx.moveTo(0, RULER_THICKNESS_PX + 0.5);
    ctx.lineTo(widthPx, RULER_THICKNESS_PX + 0.5);
    ctx.stroke();

    const worldLeft = camera.screenToWorld({ x: 0, y: 0 }).x;
    const worldRight = camera.screenToWorld({ x: widthPx, y: 0 }).x;
    ctx.strokeStyle = COLORS.tick;
    ctx.fillStyle = COLORS.text;

    const minor = step / 5;
    for (let i = Math.ceil(worldLeft / minor); i * minor <= worldRight; i++) {
      const value = i * minor;
      const sx = Math.round(camera.worldToScreen({ x: value, y: 0 }).x) + 0.5;
      const isMajor = i % 5 === 0;
      ctx.beginPath();
      ctx.moveTo(sx, RULER_THICKNESS_PX - (isMajor ? 9 : 4));
      ctx.lineTo(sx, RULER_THICKNESS_PX);
      ctx.stroke();
      if (isMajor) {
        ctx.fillText(formatRulerMeters(value, step), sx + 3, 10);
      }
    }
  }

  private drawLeftRuler(
    ctx: CanvasRenderingContext2D,
    camera: Camera2D,
    heightPx: number,
    step: number,
  ): void {
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, RULER_THICKNESS_PX, heightPx);
    ctx.strokeStyle = COLORS.border;
    ctx.beginPath();
    ctx.moveTo(RULER_THICKNESS_PX + 0.5, 0);
    ctx.lineTo(RULER_THICKNESS_PX + 0.5, heightPx);
    ctx.stroke();

    // Y = Norte cresce para cima; o topo da tela é o maior valor do mundo.
    const worldBottom = camera.screenToWorld({ x: 0, y: heightPx }).y;
    const worldTop = camera.screenToWorld({ x: 0, y: 0 }).y;
    ctx.strokeStyle = COLORS.tick;
    ctx.fillStyle = COLORS.text;

    const minor = step / 5;
    for (let i = Math.ceil(worldBottom / minor); i * minor <= worldTop; i++) {
      const value = i * minor;
      const sy = Math.round(camera.worldToScreen({ x: 0, y: value }).y) + 0.5;
      const isMajor = i % 5 === 0;
      ctx.beginPath();
      ctx.moveTo(RULER_THICKNESS_PX - (isMajor ? 9 : 4), sy);
      ctx.lineTo(RULER_THICKNESS_PX, sy);
      ctx.stroke();
      if (isMajor) {
        ctx.save();
        ctx.translate(10, sy - 4);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(formatRulerMeters(value, step), 0, 0);
        ctx.restore();
      }
    }
  }

  private drawCorner(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, RULER_THICKNESS_PX, RULER_THICKNESS_PX);
    ctx.strokeStyle = COLORS.border;
    ctx.strokeRect(0.5, 0.5, RULER_THICKNESS_PX, RULER_THICKNESS_PX);
  }
}
