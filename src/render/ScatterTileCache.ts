import {
  scatterVegetationForTile,
  tileKey,
  type BiomeRasterCache,
  type TileKey,
  type VegetationInstance,
  type WorldData,
} from '../core';

/**
 * Cache de render das instâncias de scatter POR TILE (README §4.7):
 * as instâncias nunca são dado — são regeneradas deterministicamente do
 * seed + regra quando o tile é visível, e invalidadas quando o bioma muda
 * (limpa tudo) ou o terreno é esculpido (só os tiles tocados — a
 * declividade muda onde o pincel passou).
 */
export class ScatterTileCache {
  private readonly tiles = new Map<TileKey, VegetationInstance[]>();

  constructor(
    private readonly world: WorldData,
    private readonly biomeCache: BiomeRasterCache,
  ) {}

  getTile(tx: number, ty: number): VegetationInstance[] {
    const key = tileKey(tx, ty);
    let instances = this.tiles.get(key);
    if (!instances) {
      instances = scatterVegetationForTile(
        this.world.terrain,
        this.world.biomes,
        this.biomeCache.biomeRaster,
        this.world.config.terrainResolution_m,
        tx,
        ty,
      );
      this.tiles.set(key, instances);
    }
    return instances;
  }

  invalidate(keys: TileKey[]): void {
    for (const key of keys) this.tiles.delete(key);
  }

  clear(): void {
    this.tiles.clear();
  }
}
