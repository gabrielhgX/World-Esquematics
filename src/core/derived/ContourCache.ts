import type { TerrainLayer } from '../layers/TerrainLayer';
import type { TileKey } from '../raster/TiledRaster';
import { parseTileKey, tileKey } from '../raster/TiledRaster';
import { computeTileContours, type TileContours } from './contours';

/**
 * Cache de curvas de nível POR TILE, invalidado por dirty tiles (README §6.2, D6).
 *
 * Cada tile é dono dos quadrados cujo canto inferior-esquerdo está nele; os
 * quadrados da última linha/coluna leem cantos do tile vizinho (costura sem
 * duplicação). Por isso, sujar o tile K também invalida os vizinhos à
 * esquerda/abaixo, cujos quadrados de costura leem K.
 */
export class ContourCache {
  private readonly tiles = new Map<TileKey, TileContours>();
  private interval_m = 0;

  constructor(
    private readonly terrain: TerrainLayer,
    private readonly resolution_m: number,
  ) {}

  /** Contornos do tile no intervalo dado; trocar o intervalo limpa o cache. */
  getTile(tx: number, ty: number, interval_m: number): TileContours {
    if (interval_m !== this.interval_m) {
      this.tiles.clear();
      this.interval_m = interval_m;
    }
    const key = tileKey(tx, ty);
    let contours = this.tiles.get(key);
    if (!contours) {
      contours = this.compute(tx, ty, interval_m);
      this.tiles.set(key, contours);
    }
    return contours;
  }

  /** Invalida tiles sujos + vizinhos cuja costura depende deles. */
  invalidate(dirtyKeys: TileKey[]): void {
    for (const key of dirtyKeys) {
      const { tx, ty } = parseTileKey(key);
      this.tiles.delete(key);
      this.tiles.delete(tileKey(tx - 1, ty));
      this.tiles.delete(tileKey(tx, ty - 1));
      this.tiles.delete(tileKey(tx - 1, ty - 1));
    }
  }

  clear(): void {
    this.tiles.clear();
  }

  get cachedTileCount(): number {
    return this.tiles.size;
  }

  private compute(tx: number, ty: number, interval_m: number): TileContours {
    const raster = this.terrain.raster;

    // P1-4: pula o marching squares (O(512²)) quando NENHUM nível cruza o
    // tile. A faixa considerada inclui os vizinhos leste/norte porque a
    // costura lê os cantos deles — assim o skip nunca some com uma curva.
    let min_m = Infinity;
    let max_m = -Infinity;
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      const r = this.terrain.tileHeightRange(tx + dx, ty + dy);
      if (r.min_m < min_m) min_m = r.min_m;
      if (r.max_m > max_m) max_m = r.max_m;
    }
    if (Math.floor(max_m / interval_m) < Math.ceil(min_m / interval_m)) {
      return { levels: [] };
    }

    const T = raster.tileSize;
    const cellX0 = tx * T;
    const cellY0 = ty * T;
    // Quadrados do tile: até a costura, sem passar do último canto do grid.
    const squaresX = Math.min(T, raster.widthCells - 1 - cellX0);
    const squaresY = Math.min(T, raster.heightCells - 1 - cellY0);
    return computeTileContours({
      sampleHeight: (cx, cy) => this.terrain.getHeightAtCell(cx, cy),
      cellX0,
      cellY0,
      squaresX,
      squaresY,
      resolution_m: this.resolution_m,
      interval_m,
    });
  }
}
