import type { Command } from './Command';
import type { WorldData } from '../world/WorldData';
import type { TiledRaster, TileKey } from '../raster/TiledRaster';
import { parseTileKey } from '../raster/TiledRaster';

/**
 * SculptCommand — undo de raster por DELTA DE TILE (README §5.1).
 *
 * Um traço toca N tiles; guardamos before/after SÓ dos tiles tocados, nunca
 * o mapa inteiro. `before = null` significa "o tile não existia" — o undo
 * desaloca de volta, preservando a esparsidade.
 *
 * Ciclo de vida:
 * - 1ª apply(): snapshot before → roda o kernel → snapshot after.
 * - redo: restaura os tiles after (não re-roda o kernel).
 * - revert: restaura os tiles before.
 * - mergeWith: funde dabs do mesmo traço (before mais antigo, after mais novo).
 */
export class SculptCommand implements Command {
  private readonly before = new Map<TileKey, Uint16Array | null>();
  private readonly after = new Map<TileKey, Uint16Array>();

  /** kernel do dab; consumido na primeira aplicação */
  private operation: ((raster: TiledRaster<Uint16Array>) => void) | null;
  private readonly operationTiles: TileKey[];

  constructor(
    readonly label: string,
    operation: (raster: TiledRaster<Uint16Array>) => void,
    /** tiles que a operação PODE tocar (bbox do stamp) */
    operationTiles: TileKey[],
  ) {
    this.operation = operation;
    this.operationTiles = operationTiles;
  }

  apply(world: WorldData): void {
    const raster = world.terrain.raster;
    if (this.operation) {
      for (const key of this.operationTiles) {
        if (!this.before.has(key)) {
          const { tx, ty } = parseTileKey(key);
          const tile = raster.getTile(tx, ty);
          this.before.set(key, tile ? tile.slice() : null);
        }
      }
      this.operation(raster);
      this.operation = null;
      for (const key of this.before.keys()) {
        const { tx, ty } = parseTileKey(key);
        const tile = raster.getTile(tx, ty);
        if (tile) this.after.set(key, tile.slice());
      }
      return;
    }
    // redo: restaura o estado final capturado
    for (const [key, data] of this.after) {
      const { tx, ty } = parseTileKey(key);
      raster.setTileData(tx, ty, data);
    }
  }

  revert(world: WorldData): void {
    const raster = world.terrain.raster;
    for (const [key, data] of this.before) {
      const { tx, ty } = parseTileKey(key);
      if (data === null) {
        raster.deleteTile(tx, ty);
      } else {
        raster.setTileData(tx, ty, data);
      }
    }
  }

  get memoryCost(): number {
    let bytes = 0;
    for (const data of this.before.values()) bytes += data ? data.byteLength : 0;
    for (const data of this.after.values()) bytes += data.byteLength;
    return bytes;
  }

  /** Coalescência por traço (README §5.1): ~100 eventos de mouse = UM comando. */
  mergeWith(next: Command): Command | null {
    if (!(next instanceof SculptCommand)) return null;
    for (const [key, data] of next.before) {
      if (!this.before.has(key)) this.before.set(key, data);
    }
    for (const [key, data] of next.after) {
      this.after.set(key, data);
    }
    return this;
  }
}
