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
  /** min/max por tile, recomputado LAZY (ver tileStats) */
  private readonly meta = new Map<TileKey, { min: number; max: number; statsDirty: boolean }>();

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
    const key = tileKey(tx, ty);
    this.dirty.add(key);
    this.invalidateStats(key);
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

  /**
   * Restaura o conteúdo inteiro de um tile (undo/redo por tile — README §5.1).
   * Aloca o tile se necessário e o marca sujo.
   */
  setTileData(tx: number, ty: number, data: RasterArray): void {
    const tile = this.getOrCreateTile(tx, ty);
    if (data.length !== tile.length) {
      throw new RangeError(`Tamanho de tile inválido: ${data.length} ≠ ${tile.length}`);
    }
    tile.set(data as never);
    const key = tileKey(tx, ty);
    this.dirty.add(key);
    this.invalidateStats(key);
  }

  /**
   * Desaloca um tile (volta a valer fillValue). Usado pelo undo quando o
   * comando alocou o tile — preserva a esparsidade (D4).
   */
  deleteTile(tx: number, ty: number): void {
    const key = tileKey(tx, ty);
    if (this.tiles.delete(key)) {
      this.dirty.add(key);
      this.meta.delete(key);
    }
  }

  /**
   * Min/max do tile, com rescan LAZY: escrever só marca as estatísticas
   * sujas; o scan (512² ≈ 0,3 ms) roda quando alguém pede — e apenas nos
   * tiles sujos. Incremental no set() estaria ERRADO: baixar o pico de um
   * tile não encolhe o max; só o rescan dá o valor certo.
   */
  tileStats(tx: number, ty: number): { min: number; max: number } {
    const key = tileKey(tx, ty);
    const tile = this.tiles.get(key);
    if (!tile) return { min: this.fillValue, max: this.fillValue };
    let m = this.meta.get(key);
    if (!m || m.statsDirty) {
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < tile.length; i++) {
        const v = tile[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      m = { min, max, statsDirty: false };
      this.meta.set(key, m);
    }
    return { min: m.min, max: m.max };
  }

  private invalidateStats(key: TileKey): void {
    const m = this.meta.get(key);
    if (m) m.statsDirty = true;
  }

  /**
   * Materializa o raster esparso num array denso widthCells×heightCells
   * (exportadores e serialização; README §9). Cópia por linha de tile.
   */
  toDense(createArray: (length: number) => T): T {
    const out = createArray(this.widthCells * this.heightCells);
    if (this.fillValue !== 0) out.fill(this.fillValue);
    for (const [key, tile] of this.tiles) {
      const { tx, ty } = parseTileKey(key);
      const x0 = tx * this.tileSize;
      const y0 = ty * this.tileSize;
      const w = Math.min(this.tileSize, this.widthCells - x0);
      const h = Math.min(this.tileSize, this.heightCells - y0);
      for (let row = 0; row < h; row++) {
        out.set(
          tile.subarray(row * this.tileSize, row * this.tileSize + w) as never,
          (y0 + row) * this.widthCells + x0,
        );
      }
    }
    return out;
  }

  /** Tiles cobertos por um retângulo de células (bbox de um pincel, p.ex.). */
  tilesInCellRect(cx0: number, cy0: number, cx1: number, cy1: number): TileKey[] {
    const x0 = Math.max(0, Math.floor(cx0));
    const y0 = Math.max(0, Math.floor(cy0));
    const x1 = Math.min(this.widthCells - 1, Math.ceil(cx1));
    const y1 = Math.min(this.heightCells - 1, Math.ceil(cy1));
    if (x0 > x1 || y0 > y1) return [];
    const keys: TileKey[] = [];
    for (let ty = Math.floor(y0 / this.tileSize); ty <= Math.floor(y1 / this.tileSize); ty++) {
      for (let tx = Math.floor(x0 / this.tileSize); tx <= Math.floor(x1 / this.tileSize); tx++) {
        keys.push(tileKey(tx, ty));
      }
    }
    return keys;
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
