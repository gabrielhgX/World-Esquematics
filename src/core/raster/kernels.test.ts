import { describe, expect, it } from 'vitest';
import { TiledRaster } from './TiledRaster';
import { falloffWeight, stampCellBounds, type BrushStamp } from './kernels';
import { TsRasterKernels } from './kernelsTs';

const makeRaster = (base = 1000) =>
  new TiledRaster<Uint16Array>({
    widthCells: 256,
    heightCells: 256,
    tileSize: 64,
    fillValue: base,
    createTile: (n) => new Uint16Array(n),
  });

const stamp = (over: Partial<BrushStamp> = {}): BrushStamp => ({
  cx_cells: 128,
  cy_cells: 128,
  radius_cells: 10,
  strength: 1,
  falloff: 'linear',
  ...over,
});

const kernels = new TsRasterKernels();

describe('falloffWeight (README §7.1)', () => {
  it('todos valem 1 no centro e (exceto constant) 0 na borda', () => {
    for (const kind of ['linear', 'smooth', 'sharp'] as const) {
      expect(falloffWeight(kind, 0)).toBe(1);
      expect(falloffWeight(kind, 1)).toBe(0);
    }
    expect(falloffWeight('constant', 0)).toBe(1);
    expect(falloffWeight('constant', 1)).toBe(1);
  });

  it('sharp cai mais rápido que linear; smooth é suave no meio', () => {
    expect(falloffWeight('sharp', 0.5)).toBeLessThan(falloffWeight('linear', 0.5));
    expect(falloffWeight('smooth', 0.5)).toBeCloseTo(0.5, 9);
  });
});

describe('TsRasterKernels (README §7.1, §10.1)', () => {
  it('raise: centro sobe o valor cheio, borda sobe menos (falloff)', () => {
    const raster = makeRaster();
    kernels.applyRaise(raster, stamp(), 100);
    expect(raster.get(128, 128)).toBe(1100);
    const nearEdge = raster.get(128 + 8, 128); // t = 0.8 → peso 0.2
    expect(nearEdge).toBeGreaterThan(1000);
    expect(nearEdge).toBeLessThan(1100);
    expect(raster.get(128 + 11, 128)).toBe(1000); // fora do raio: intocada
  });

  it('raise com constant: uniforme dentro do círculo', () => {
    const raster = makeRaster();
    kernels.applyRaise(raster, stamp({ falloff: 'constant' }), 100);
    expect(raster.get(128, 128)).toBe(1100);
    expect(raster.get(128 + 9, 128)).toBe(1100);
  });

  it('lower é raise com amount negativo; clampa em 0', () => {
    const raster = makeRaster(50);
    kernels.applyRaise(raster, stamp({ falloff: 'constant' }), -100);
    expect(raster.get(128, 128)).toBe(0);
  });

  it('raise clampa em 65535', () => {
    const raster = makeRaster(65500);
    kernels.applyRaise(raster, stamp({ falloff: 'constant' }), 100);
    expect(raster.get(128, 128)).toBe(65535);
  });

  it('smooth reduz um pico isolado sem tocar terreno plano', () => {
    const raster = makeRaster();
    raster.set(128, 128, 2000);
    kernels.applySmooth(raster, stamp({ falloff: 'constant' }));
    const peak = raster.get(128, 128);
    expect(peak).toBeLessThan(2000);
    expect(peak).toBeGreaterThan(1000);
    expect(raster.get(50, 50)).toBe(1000); // fora do stamp
  });

  it('flatten puxa para o alvo do primeiro clique', () => {
    const raster = makeRaster(1000);
    kernels.applyFlatten(raster, stamp({ falloff: 'constant' }), 3000);
    expect(raster.get(128, 128)).toBe(3000);
  });

  it('pincel atravessando a borda do mapa não explode', () => {
    const raster = makeRaster();
    kernels.applyRaise(raster, stamp({ cx_cells: 0, cy_cells: 0 }), 100);
    expect(raster.get(0, 0)).toBe(1100);
  });

  it('stampCellBounds clampa ao grid e devolve null fora do mapa', () => {
    const raster = makeRaster();
    expect(stampCellBounds(raster, stamp({ cx_cells: 0, cy_cells: 0 }))).toEqual({
      x0: 0,
      y0: 0,
      x1: 10,
      y1: 10,
    });
    expect(stampCellBounds(raster, stamp({ cx_cells: -100, cy_cells: -100 }))).toBeNull();
  });
});
