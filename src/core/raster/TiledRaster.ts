/**
 * Raster genérico dividido em tiles esparsos de 512×512 (README D4, §4.2).
 *
 * - Esparso: tile ausente = `fillValue`; um mapa recém-criado ocupa ~0 bytes.
 * - Alocação preguiçosa: o tile nasce no primeiro `set()`.
 * - Dirty tracking por tile: undo barato, render parcial, save incremental.
 */

export type RasterArray = Uint8Array | Uint16Array | Uint32Array | Float32Array | Float64Array;

/** Chave de tile no formato "tx,ty" (README §4.2). */
export type TileKey = string;

export const DEFAULT_TILE_SIZE = 512;

export function tileKey(tx: number, ty: number): TileKey {
  return `${tx},${ty}`;
}

export function parseTileKey(key: TileKey): { tx: number; ty: number } {
  const comma = key.indexOf(',');
  return { tx: Number(key.slice(0, comma)), ty: Number(key.slice(comma + 1)) };
}

export interface TiledRasterOptions<T extends RasterArray> {
  widthCells: number;
  heightCells: number;
  /** lado do tile em células; padrão 512 (D4) */
  tileSize?: number;
  /** valor de células sem tile alocado (ex.: `baseHeight_u16` do terreno); padrão 0 */
  fillValue?: number;
  /** fábrica do typed array de cada tile, ex.: `(n) => new Uint16Array(n)` */
  createTile: (length: number) => T;
}

export class TiledRaster<T extends RasterArray> {
  readonly widthCells: number;
  readonly heightCells: number;
  readonly tileSize: number;
  readonly fillValue: number;
  /** quantidade de tiles no eixo X/Y (grade de tiles, não de células) */
  readonly tilesX: number;
  readonly tilesY: number;

  private readonly createTileArray: (length: number) => T;
  private readonly bytesPerElement: number;
  private readonly tiles = new Map<TileKey, T>();
  private readonly dirty = new Set<TileKey>();

  constructor(options: TiledRasterOptions<T>) {
    if (!(options.widthCells > 0) || !(options.heightCells > 0)) {
      throw new RangeError('TiledRaster exige dimensões positivas.');
    }
    this.widthCells = Math.floor(options.widthCells);
    this.heightCells = Math.floor(options.heightCells);
    this.tileSize = options.tileSize ?? DEFAULT_TILE_SIZE;
    this.fillValue = options.fillValue ?? 0;
    this.createTileArray = options.createTile;
    this.bytesPerElement = options.createTile(0).BYTES_PER_ELEMENT;
    this.tilesX = Math.ceil(this.widthCells / this.tileSize);
    this.tilesY = Math.ceil(this.heightCells / this.tileSize);
  }

  /**
   * Lê a célula. Fora dos limites faz CLAMP na borda — comportamento que a
   * amostragem bilinear (README §1.2) precisa nas beiradas do mapa.
   */
  get(cx: number, cy: number): number {
    const x = clampInt(cx, 0, this.widthCells - 1);
    const y = clampInt(cy, 0, this.heightCells - 1);
    const tx = Math.floor(x / this.tileSize);
    const ty = Math.floor(y / this.tileSize);
    const tile = this.tiles.get(tileKey(tx, ty));
    if (!tile) return this.fillValue;
    return tile[(y - ty * this.tileSize) * this.tileSize + (x - tx * this.tileSize)];
  }

  /**
   * Escreve na célula: aloca o tile no primeiro toque e o marca sujo.
   * Fora dos limites devolve `false` sem alocar nada (amigável a pincéis
   * que passam da borda).
   */
  set(cx: number, cy: number, value: number): boolean {
    if (cx < 0 || cy < 0 || cx >= this.widthCells || cy >= this.heightCells) {
      return false;
    }
    const tx = Math.floor(cx / this.tileSize);
    const ty = Math.floor(cy / this.tileSize);
    const tile = this.getOrCreateTile(tx, ty);
    tile[(cy - ty * this.tileSize) * this.tileSize + (cx - tx * this.tileSize)] = value;
    this.dirty.add(tileKey(tx, ty));
    return true;
  }

  getTile(tx: number, ty: number): T | undefined {
    return this.tiles.get(tileKey(tx, ty));
  }

  getOrCreateTile(tx: number, ty: number): T {
    if (tx < 0 || ty < 0 || tx >= this.tilesX || ty >= this.tilesY) {
      throw new RangeError(`Tile fora da grade: ${tileKey(tx, ty)}`);
    }
    const key = tileKey(tx, ty);
    let tile = this.tiles.get(key);
    if (!tile) {
      tile = this.createTileArray(this.tileSize * this.tileSize);
      if (this.fillValue !== 0) tile.fill(this.fillValue);
      this.tiles.set(key, tile);
    }
    return tile;
  }

  hasTile(tx: number, ty: number): boolean {
    return this.tiles.has(tileKey(tx, ty));
  }

  get allocatedTileCount(): number {
    return this.tiles.size;
  }

  allocatedTiles(): IterableIterator<[TileKey, T]> {
    return this.tiles.entries();
  }

  /** Marca um tile sujo explicitamente (ex.: undo que restaurou o tile inteiro). */
  markTileDirty(tx: number, ty: number): void {
    if (tx < 0 || ty < 0 || tx >= this.tilesX || ty >= this.tilesY) return;
    this.dirty.add(tileKey(tx, ty));
  }

  /** Devolve os tiles sujos e limpa o conjunto (consumido pelo render/derivados). */
  consumeDirty(): TileKey[] {
    const keys = [...this.dirty];
    this.dirty.clear();
    return keys;
  }

  get dirtyCount(): number {
    return this.dirty.size;
  }

  /** Memória ocupada pelos tiles alocados, em bytes. */
  estimatedBytes(): number {
    return this.tiles.size * this.tileSize * this.tileSize * this.bytesPerElement;
  }
}

function clampInt(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(v)));
}
