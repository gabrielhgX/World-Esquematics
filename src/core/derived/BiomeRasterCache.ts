import type { BiomeLayer } from '../layers/BiomeLayer';
import { rasterizePolygon } from '../geometry/rasterize';
import { TiledRaster, type TileKey } from '../raster/TiledRaster';

/**
 * Raster uint8 DERIVADO dos polígonos de bioma (README §4.4):
 * polígono é fonte, raster é cache invalidável. É este raster que vira
 * weightmap na exportação. 0 = sem bioma; polígonos pintados depois
 * sobrescrevem os anteriores (ordem de pintura).
 */
export class BiomeRasterCache {
  private raster: TiledRaster<Uint8Array>;
  private syncedVersion = -1;

  constructor(
    private readonly widthCells: number,
    private readonly heightCells: number,
    private readonly resolution_m: number,
  ) {
    this.raster = this.createRaster();
  }

  get biomeRaster(): TiledRaster<Uint8Array> {
    return this.raster;
  }

  /** id do bioma na célula que cobre o ponto (0 = nenhum). */
  biomeIdAt(x_m: number, y_m: number): number {
    return this.raster.get(
      Math.floor(x_m / this.resolution_m),
      Math.floor(y_m / this.resolution_m),
    );
  }

  /**
   * Sincroniza com a camada. Devolve os tiles a re-enviar à GPU
   * (união dos alocados antes e depois); vazio = em dia.
   */
  sync(biomes: BiomeLayer): TileKey[] {
    if (biomes.version === this.syncedVersion) return [];
    this.syncedVersion = biomes.version;

    const dirty = new Set<TileKey>();
    for (const [key] of this.raster.allocatedTiles()) dirty.add(key);

    this.raster = this.createRaster();
    for (const item of biomes.polygons) {
      rasterizePolygon(this.raster, item.polygon, item.biomeId, this.resolution_m);
    }
    for (const [key] of this.raster.allocatedTiles()) dirty.add(key);
    this.raster.consumeDirty();
    return [...dirty];
  }

  private createRaster(): TiledRaster<Uint8Array> {
    return new TiledRaster<Uint8Array>({
      widthCells: this.widthCells,
      heightCells: this.heightCells,
      fillValue: 0,
      createTile: (n) => new Uint8Array(n),
    });
  }
}
