import type { ContourCache, WorldData } from '../../core';
import type { Camera2D } from '../Camera2D';
import { formatMeters } from '../format';
import { niceStep } from './RulerOverlay';

/**
 * Desenho das curvas de nível (README §6.2): lê o ContourCache (derivado,
 * por tile) e desenha só os tiles visíveis. Índice a cada 5ª linha: mais
 * grossa, com rótulo.
 */

/**
 * Intervalo pelo RELEVO REAL do mapa, com piso pelo zoom (P0-5). Antes o
 * intervalo era só do zoom: 100 m num mapa de ±40 m desenhava exatamente
 * UMA curva. Alvo: ~15 curvas cobrindo o relevo.
 */
export function contourInterval(metersPerPixel: number, relief_m: number): number {
  const byRelief = niceStep(Math.max(relief_m, 1) / 15);
  // piso FRACO pelo zoom: muito afastado, menos curvas (relevo típico é
  // suave — um piso agressivo faria o zoom mandar de novo, como antes)
  const byZoom = niceStep(Math.max(metersPerPixel * 0.1, 0.01));
  return Math.max(byRelief, byZoom);
}

const STYLE = {
  normal: { stroke: 'rgba(92, 64, 38, 0.45)', width: 0.75 },
  index: { stroke: 'rgba(92, 64, 38, 0.85)', width: 1.5 },
};

export class ContourOverlay {
  constructor(
    private readonly world: WorldData,
    private readonly cache: ContourCache,
  ) {}

  draw(ctx: CanvasRenderingContext2D, camera: Camera2D, interval_m: number): void {
    const raster = this.world.terrain.raster;
    const res = this.world.config.terrainResolution_m;
    const interval = interval_m;
    const { width, height } = camera.viewportSize;

    // Faixa de tiles visível (world Y cresce para cima; tela para baixo).
    const topLeft = camera.screenToWorld({ x: 0, y: 0 });
    const bottomRight = camera.screenToWorld({ x: width, y: height });
    const tileSpan = raster.tileSize * res;
    const tx0 = Math.max(0, Math.floor(bottomRight.x >= 0 ? topLeft.x / tileSpan : 0));
    const tx1 = Math.min(raster.tilesX - 1, Math.floor(bottomRight.x / tileSpan));
    const ty0 = Math.max(0, Math.floor(bottomRight.y / tileSpan));
    const ty1 = Math.min(raster.tilesY - 1, Math.floor(topLeft.y / tileSpan));
    if (tx0 > tx1 || ty0 > ty1) return;

    const mpp = camera.metersPerPixel;
    const tilePx = tileSpan / mpp;
    const drawLabels = tilePx > 250;

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const contours = this.cache.getTile(tx, ty, interval);
        for (const level of contours.levels) {
          const style = level.isIndex ? STYLE.index : STYLE.normal;
          ctx.strokeStyle = style.stroke;
          ctx.lineWidth = style.width;
          ctx.beginPath();
          const seg = level.segments;
          for (let p = 0; p < seg.length; p += 4) {
            const a = camera.worldToScreen({ x: seg[p], y: seg[p + 1] });
            const b = camera.worldToScreen({ x: seg[p + 2], y: seg[p + 3] });
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          }
          ctx.stroke();

          if (drawLabels && level.isIndex && seg.length >= 4) {
            // um rótulo por tile, no primeiro segmento VISÍVEL do nível
            const margin = 40;
            for (let p = 0; p < seg.length; p += 4) {
              const pt = camera.worldToScreen({
                x: (seg[p] + seg[p + 2]) / 2,
                y: (seg[p + 1] + seg[p + 3]) / 2,
              });
              if (pt.x < margin || pt.x > width - margin) continue;
              if (pt.y < margin || pt.y > height - margin) continue;
              ctx.font = '10px system-ui, sans-serif';
              ctx.textBaseline = 'middle';
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
              ctx.lineWidth = 2.5;
              const text = formatMeters(level.level_m);
              ctx.strokeText(text, pt.x + 3, pt.y);
              ctx.fillStyle = '#4a3a26';
              ctx.fillText(text, pt.x + 3, pt.y);
              break;
            }
          }
        }
      }
    }
  }
}
