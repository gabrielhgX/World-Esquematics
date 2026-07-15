import { describe, expect, it } from 'vitest';
import { WaterLayer } from '../layers/WaterLayer';
import { WaterSurfaceCache } from './WaterSurfaceCache';
import { heightToU16, u16ToHeight } from '../world/conversions';

const RANGE = { min_m: -200, max_m: 1800 };

const makeCache = () => new WaterSurfaceCache(1024, 1024, 4, RANGE);

const squareLake = (surface_m: number) => ({
  id: 'lake-1',
  kind: 'lake' as const,
  surface_m,
  polygon: [
    [400, 400],
    [800, 400],
    [800, 800],
    [400, 800],
  ] as Array<[number, number]>,
  material: 'water_lake',
});

describe('WaterSurfaceCache (D6 — derivado, nunca persiste)', () => {
  it('rasteriza o polígono do lago com a cota codificada', () => {
    const water = new WaterLayer('w');
    water.addBody(squareLake(30));
    const cache = makeCache();
    const dirty = cache.sync(water);
    expect(dirty.length).toBeGreaterThan(0);

    const raster = cache.surfaceRaster;
    // dentro do lago: célula (150,150) = (600 m, 600 m)
    const inside = raster.get(150, 150);
    expect(inside).toBeGreaterThan(0);
    expect(u16ToHeight(inside, RANGE)).toBeCloseTo(30, 1);
    // fora: sentinela 0
    expect(raster.get(50, 50)).toBe(0);
    expect(raster.get(250, 150)).toBe(0);
  });

  it('sem mudança de versão, sync é no-op', () => {
    const water = new WaterLayer('w');
    water.addBody(squareLake(30));
    const cache = makeCache();
    cache.sync(water);
    expect(cache.sync(water)).toEqual([]);
  });

  it('remover o lago limpa o raster e reporta os tiles antigos', () => {
    const water = new WaterLayer('w');
    const lake = squareLake(30);
    water.addBody(lake);
    const cache = makeCache();
    cache.sync(water);

    water.removeBody(lake.id);
    const dirty = cache.sync(water);
    expect(dirty.length).toBeGreaterThan(0); // tiles antigos precisam re-upload
    expect(cache.surfaceRaster.get(150, 150)).toBe(0);
    expect(cache.surfaceRaster.allocatedTileCount).toBe(0);
  });

  it('cota no fundo do range nunca colide com o sentinela 0', () => {
    const water = new WaterLayer('w');
    water.addBody({ ...squareLake(RANGE.min_m), id: 'deep' });
    const cache = makeCache();
    cache.sync(water);
    expect(cache.surfaceRaster.get(150, 150)).toBe(Math.max(1, heightToU16(RANGE.min_m, RANGE)));
    expect(cache.surfaceRaster.get(150, 150)).toBeGreaterThan(0);
  });
});
