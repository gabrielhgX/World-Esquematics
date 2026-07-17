import type { TerrainLayer } from '../layers/TerrainLayer';
import type { WorldConfig } from '../world/WorldConfig';
import { parseTileKey } from '../raster/TiledRaster';
import { u16ToHeight } from '../world/conversions';

/**
 * Estatísticas DERIVADAS do relevo real (nunca persistem — D6).
 *
 * A causa raiz do "terreno verde chapado": todo o pipeline de exibição
 * assumia o heightRange de ARMAZENAMENTO (−200..1800 m) como faixa de
 * exibição, quando o mapa real vive em ±40 m. Este objeto conhece a faixa
 * REAL e alimenta a rampa de cor, o z-factor do hillshade e o intervalo
 * das curvas de nível.
 *
 * Custo: lê o min/max lazy por tile (TiledRaster.tileStats) — só tiles
 * sujos são re-escaneados.
 */

export interface DataRange {
  min_m: number;
  max_m: number;
}

/** faixa mínima de exibição quando o mapa é (quase) plano — sem div/0 */
export const FLAT_FALLBACK_SPAN_M = 50;

export class TerrainStats {
  constructor(
    private readonly terrain: TerrainLayer,
    private readonly config: WorldConfig,
  ) {}

  /** Faixa REAL do relevo em metros (não o heightRange de armazenamento). */
  dataRange(): DataRange {
    const raster = this.terrain.raster;
    let min = Infinity;
    let max = -Infinity;
    for (const [key] of raster.allocatedTiles()) {
      const { tx, ty } = parseTileKey(key);
      const stats = raster.tileStats(tx, ty);
      if (stats.min < min) min = stats.min;
      if (stats.max > max) max = stats.max;
    }
    // área sem tile alocado vale a altura-base — ela também é relevo visível
    const total = raster.tilesX * raster.tilesY;
    if (raster.allocatedTileCount < total || raster.allocatedTileCount === 0) {
      const base = raster.fillValue;
      if (base < min) min = base;
      if (base > max) max = base;
    }
    const range = this.config.heightRange;
    return { min_m: u16ToHeight(min, range), max_m: u16ToHeight(max, range) };
  }

  relief_m(): number {
    const r = this.dataRange();
    return r.max_m - r.min_m;
  }

  /**
   * Faixa de EXIBIÇÃO: o dataRange com margem (as pontas não saturam) e um
   * piso para mapa plano (a rampa não divide por zero nem pisca).
   */
  displayRange(marginPct = 0.05): DataRange {
    const data = this.dataRange();
    const span = data.max_m - data.min_m;
    if (span < 1) {
      const center = (data.max_m + data.min_m) / 2;
      return { min_m: center - FLAT_FALLBACK_SPAN_M / 2, max_m: center + FLAT_FALLBACK_SPAN_M / 2 };
    }
    const margin = span * marginPct;
    return { min_m: data.min_m - margin, max_m: data.max_m + margin };
  }

  /**
   * p95 do módulo do gradiente (m/m), por amostragem esparsa (~10k células
   * nos tiles alocados). Alimenta o z-factor automático do hillshade.
   */
  gradientP95(): number {
    const raster = this.terrain.raster;
    const res = this.config.terrainResolution_m;
    const range = this.config.heightRange;
    const tiles = [...raster.allocatedTiles()];
    if (tiles.length === 0) return 0;

    const samplesPerTile = Math.max(16, Math.floor(10_000 / tiles.length));
    const stride = Math.max(1, Math.floor(raster.tileSize / Math.sqrt(samplesPerTile)));
    const gradients: number[] = [];
    const toM = (u16: number) => u16ToHeight(u16, range);

    for (const [key] of tiles) {
      const { tx, ty } = parseTileKey(key);
      const x0 = tx * raster.tileSize;
      const y0 = ty * raster.tileSize;
      for (let dy = stride >> 1; dy < raster.tileSize; dy += stride) {
        for (let dx = stride >> 1; dx < raster.tileSize; dx += stride) {
          const cx = x0 + dx;
          const cy = y0 + dy;
          if (cx >= raster.widthCells || cy >= raster.heightCells) continue;
          const gx = (toM(raster.get(cx + 1, cy)) - toM(raster.get(cx - 1, cy))) / (2 * res);
          const gy = (toM(raster.get(cx, cy + 1)) - toM(raster.get(cx, cy - 1))) / (2 * res);
          gradients.push(Math.hypot(gx, gy));
        }
      }
    }
    if (gradients.length === 0) return 0;
    gradients.sort((a, b) => a - b);
    return gradients[Math.min(gradients.length - 1, Math.floor(gradients.length * 0.95))];
  }
}
