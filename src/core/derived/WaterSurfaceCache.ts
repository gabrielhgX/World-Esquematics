import type { WaterLayer } from '../layers/WaterLayer';
import type { HeightRange } from '../world/WorldConfig';
import { heightToU16 } from '../world/conversions';
import { rasterizePolygon } from '../geometry/rasterize';
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
      rasterizePolygon(this.raster, lake.polygon, encoded, this.resolution_m);
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
}
