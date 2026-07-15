import type { WaterLayer } from '../layers/WaterLayer';
import type { HeightRange } from '../world/WorldConfig';
import type { PolygonRing } from '../geometry/polygon';
import { heightToU16 } from '../world/conversions';
import { TiledRaster, type TileKey } from '../raster/TiledRaster';

/**
 * Raster DERIVADO da superfície d'água dos lagos (D6 — nunca persiste):
 * cada célula guarda a cota da superfície em u16, 0 = sem água. O shader lê
 * este raster + o nível do mar (uniform) e deriva a profundidade por pixel.
 *
 * Rebuild completo quando a WaterLayer muda de versão — lagos são poucos e
 * o custo é proporcional à área deles (raster esparso).
 */
export class WaterSurfaceCache {
  private raster: TiledRaster<Uint16Array>;
  private syncedVersion = -1;

  constructor(
    private readonly widthCells: number,
    private readonly heightCells: number,
    private readonly resolution_m: number,
    private readonly heightRange: HeightRange,
  ) {
    this.raster = this.createRaster();
  }

  get surfaceRaster(): TiledRaster<Uint16Array> {
    return this.raster;
  }

  /**
   * Sincroniza com a camada d'água. Devolve os tiles a re-enviar à GPU
   * (união dos alocados antes e depois); vazio = já estava em dia.
   */
  sync(water: WaterLayer): TileKey[] {
    if (water.version === this.syncedVersion) return [];
    this.syncedVersion = water.version;

    const dirty = new Set<TileKey>();
    for (const [key] of this.raster.allocatedTiles()) dirty.add(key);

    this.raster = this.createRaster();
    for (const lake of water.lakes) {
      if (lake.polygon.length < 3) continue;
      // 0 é o sentinela "sem água" — cota codificada nunca fica abaixo de 1
      const encoded = Math.max(1, heightToU16(lake.surface_m, this.heightRange));
      this.rasterizePolygon(lake.polygon, encoded);
    }
    for (const [key] of this.raster.allocatedTiles()) dirty.add(key);
    this.raster.consumeDirty();
    return [...dirty];
  }

  private createRaster(): TiledRaster<Uint16Array> {
    return new TiledRaster<Uint16Array>({
      widthCells: this.widthCells,
      heightCells: this.heightCells,
      fillValue: 0,
      createTile: (n) => new Uint16Array(n),
    });
  }

  /** Scanline par-ímpar: preenche células cujo ponto de amostragem cai dentro. */
  private rasterizePolygon(polygon: PolygonRing, value: number): void {
    const res = this.resolution_m;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of polygon) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const cy0 = Math.max(0, Math.ceil(minY / res));
    const cy1 = Math.min(this.heightCells - 1, Math.floor(maxY / res));

    const xs: number[] = [];
    for (let cy = cy0; cy <= cy1; cy++) {
      const y = cy * res;
      xs.length = 0;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        // regra semiaberta (yi ≤ y < yj ou yj ≤ y < yi) evita contar vértices 2×
        if (yi <= y === yj <= y) continue;
        xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const cx0 = Math.max(0, Math.ceil(xs[k] / res));
        const cx1 = Math.min(this.widthCells - 1, Math.floor(xs[k + 1] / res));
        for (let cx = cx0; cx <= cx1; cx++) {
          this.raster.set(cx, cy, value);
        }
      }
    }
  }
}
