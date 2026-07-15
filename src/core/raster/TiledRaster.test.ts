import { describe, expect, it } from 'vitest';
import { TiledRaster, tileKey, parseTileKey } from './TiledRaster';

const makeRaster = (fillValue = 7) =>
  new TiledRaster({
    widthCells: 1024,
    heightCells: 1024,
    fillValue,
    createTile: (n) => new Uint16Array(n),
  });

describe('TiledRaster esparso (README D4, §4.2)', () => {
  it('mapa recém-criado ocupa ~0 bytes e devolve fillValue', () => {
    const raster = makeRaster();
    expect(raster.allocatedTileCount).toBe(0);
    expect(raster.estimatedBytes()).toBe(0);
    expect(raster.get(500, 500)).toBe(7);
  });

  it('set aloca o tile no primeiro toque, preservando fillValue no resto', () => {
    const raster = makeRaster();
    expect(raster.set(10, 20, 123)).toBe(true);
    expect(raster.allocatedTileCount).toBe(1);
    expect(raster.get(10, 20)).toBe(123);
    expect(raster.get(11, 20)).toBe(7); // mesma tile, célula intocada
  });

  it('células caem no tile certo (grade 2×2 de tiles de 512)', () => {
    const raster = makeRaster();
    raster.set(0, 0, 1);
    raster.set(700, 700, 2);
    expect(raster.tilesX).toBe(2);
    expect(raster.tilesY).toBe(2);
    expect(raster.hasTile(0, 0)).toBe(true);
    expect(raster.hasTile(1, 1)).toBe(true);
    expect(raster.allocatedTileCount).toBe(2);
    expect(raster.get(700, 700)).toBe(2);
  });

  it('dirty tracking: set marca o tile; consumeDirty devolve e limpa', () => {
    const raster = makeRaster();
    raster.set(0, 0, 1);
    raster.set(1, 0, 2); // mesmo tile
    raster.set(600, 0, 3); // tile vizinho
    expect(raster.dirtyCount).toBe(2);
    expect(raster.consumeDirty().sort()).toEqual(['0,0', '1,0']);
    expect(raster.dirtyCount).toBe(0);
  });

  it('get fora dos limites faz clamp na borda (necessário para bilinear)', () => {
    const raster = makeRaster();
    raster.set(0, 1023, 42);
    expect(raster.get(-5, 2000)).toBe(42); // clampa para (0, 1023)
  });

  it('set fora dos limites devolve false e não aloca', () => {
    const raster = makeRaster();
    expect(raster.set(-1, 0, 1)).toBe(false);
    expect(raster.set(0, 1024, 1)).toBe(false);
    expect(raster.allocatedTileCount).toBe(0);
  });

  it('estimatedBytes = tiles alocados × 512² × 2 bytes', () => {
    const raster = makeRaster();
    raster.set(0, 0, 1);
    expect(raster.estimatedBytes()).toBe(512 * 512 * 2);
  });

  it('tileKey e parseTileKey são inversos', () => {
    expect(tileKey(3, 5)).toBe('3,5');
    expect(parseTileKey('3,5')).toEqual({ tx: 3, ty: 5 });
  });
});
