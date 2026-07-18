import type { Layer } from '../world/Layer';
import type { WorldConfig } from '../world/WorldConfig';
import { deriveGrid } from '../world/WorldConfig';
import { heightToU16, sampleBilinear, u16ToHeight } from '../world/conversions';
import { TiledRaster } from '../raster/TiledRaster';

/**
 * TerrainLayer — o relevo (README §4.2).
 *
 * Raster tiled ESPARSO de uint16: tile ausente = baseHeight_u16, então um
 * mapa recém-criado ocupa ~0 bytes. `slope`/`normal` são derivados no shader
 * (gradiente das vizinhas), nunca armazenados. "Tipo de solo" não vive aqui —
 * é a BiomeLayer (um dado, um dono).
 */
export class TerrainLayer implements Layer {
  readonly type = 'terrain' as const;
  name = 'Relevo';
  visible = true;
  locked = false;
  opacity = 1;
  order = 0;

  /** valor de tiles não alocados: cota 0 m (clampada ao heightRange) */
  readonly baseHeight_u16: number;
  readonly raster: TiledRaster<Uint16Array>;

  private readonly resolution_m: number;
  private readonly heightRange: WorldConfig['heightRange'];

  constructor(
    config: WorldConfig,
    readonly id: string,
  ) {
    const grid = deriveGrid(config);
    this.resolution_m = config.terrainResolution_m;
    this.heightRange = config.heightRange;
    this.baseHeight_u16 = heightToU16(0, config.heightRange);
    this.raster = new TiledRaster<Uint16Array>({
      widthCells: grid.widthCells,
      heightCells: grid.heightCells,
      fillValue: this.baseHeight_u16,
      createTile: (n) => new Uint16Array(n),
    });
  }

  /**
   * Altura em METROS numa posição arbitrária do mundo — bilinear entre as
   * 4 células vizinhas (README §1.2/§4.2). Nunca nearest.
   */
  getHeight(x_m: number, y_m: number): number {
    const u16 = sampleBilinear((cx, cy) => this.raster.get(cx, cy), x_m, y_m, this.resolution_m);
    return u16ToHeight(u16, this.heightRange);
  }

  /** Altura em METROS no ponto de amostragem de uma célula (clamp na borda). */
  getHeightAtCell(cx: number, cy: number): number {
    return u16ToHeight(this.raster.get(cx, cy), this.heightRange);
  }

  /**
   * Min/max de um tile em METROS (lazy, via TiledRaster.tileStats). Usado
   * para pular tiles onde nenhuma curva de nível passa (P1-4).
   */
  tileHeightRange(tx: number, ty: number): { min_m: number; max_m: number } {
    const stats = this.raster.tileStats(tx, ty);
    return {
      min_m: u16ToHeight(stats.min, this.heightRange),
      max_m: u16ToHeight(stats.max, this.heightRange),
    };
  }
}
