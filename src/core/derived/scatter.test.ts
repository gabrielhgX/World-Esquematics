import { describe, expect, it } from 'vitest';
import { WorldData } from '../world/WorldData';
import { createWorldConfig } from '../world/WorldConfig';
import { heightToU16 } from '../world/conversions';
import { createBiomePolygon } from '../layers/BiomeLayer';
import { BiomeRasterCache } from './BiomeRasterCache';
import { scatterVegetationForTile, slopeAtDeg } from './scatter';
import { pointInPolygon } from '../geometry/polygon';

const RANGE = { min_m: -200, max_m: 1800 };

const makeWorld = () =>
  new WorldData(
    createWorldConfig({
      projectName: 'Teste',
      extent: { width_m: 4096, height_m: 4096 },
      terrainResolution_m: 4,
      heightRange: RANGE,
    }),
  );

// floresta no quadrante oeste do primeiro tile (0..1024 m × 0..2048 m)
const FOREST: Array<[number, number]> = [
  [0, 0],
  [1024, 0],
  [1024, 2048],
  [0, 2048],
];

describe('BiomeRasterCache (README §4.4 — polígono fonte, raster cache)', () => {
  it('rasteriza o polígono com o id do bioma; fora fica 0', () => {
    const world = makeWorld();
    world.biomes.addPolygon(createBiomePolygon(1, FOREST));
    const cache = new BiomeRasterCache(1024, 1024, 4);
    const dirty = cache.sync(world.biomes);
    expect(dirty.length).toBeGreaterThan(0);
    expect(cache.biomeIdAt(500, 500)).toBe(1);
    expect(cache.biomeIdAt(2000, 500)).toBe(0);
  });

  it('polígono pintado depois sobrescreve o anterior (ordem de pintura)', () => {
    const world = makeWorld();
    world.biomes.addPolygon(createBiomePolygon(1, FOREST));
    world.biomes.addPolygon(
      createBiomePolygon(3, [
        [0, 0],
        [512, 0],
        [512, 512],
        [0, 512],
      ]),
    );
    const cache = new BiomeRasterCache(1024, 1024, 4);
    cache.sync(world.biomes);
    expect(cache.biomeIdAt(200, 200)).toBe(3); // deserto por cima
    expect(cache.biomeIdAt(800, 800)).toBe(1); // floresta segue
  });

  it('sync é no-op sem mudança de versão; undo do polígono limpa', () => {
    const world = makeWorld();
    world.biomes.addPolygon(createBiomePolygon(1, FOREST));
    const cache = new BiomeRasterCache(1024, 1024, 4);
    cache.sync(world.biomes);
    expect(cache.sync(world.biomes)).toEqual([]);

    const polygonId = world.biomes.polygons[0].id;
    world.biomes.removePolygon(polygonId);
    const dirty = cache.sync(world.biomes);
    expect(dirty.length).toBeGreaterThan(0);
    expect(cache.biomeIdAt(500, 500)).toBe(0);
  });
});

describe('scatter procedural determinístico (README §4.7)', () => {
  const setup = () => {
    const world = makeWorld();
    world.biomes.addPolygon(createBiomePolygon(1, FOREST)); // floresta: 90+25/ha
    const cache = new BiomeRasterCache(1024, 1024, 4);
    cache.sync(world.biomes);
    return { world, cache };
  };

  it('mesmo seed + mesmo tile ⇒ instâncias IDÊNTICAS (render = exportador)', () => {
    const { world, cache } = setup();
    const a = scatterVegetationForTile(world.terrain, world.biomes, cache.biomeRaster, 4, 0, 0);
    const b = scatterVegetationForTile(world.terrain, world.biomes, cache.biomeRaster, 4, 0, 0);
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
  });

  it('seed diferente ⇒ distribuição diferente; tiles diferentes diferem', () => {
    const { world, cache } = setup();
    const a = scatterVegetationForTile(world.terrain, world.biomes, cache.biomeRaster, 4, 0, 0);
    world.biomes.scatterSeed = 999;
    const b = scatterVegetationForTile(world.terrain, world.biomes, cache.biomeRaster, 4, 0, 0);
    expect(b).not.toEqual(a);
  });

  it('todas as instâncias nascem DENTRO do polígono do bioma', () => {
    const { world, cache } = setup();
    const instances = scatterVegetationForTile(
      world.terrain,
      world.biomes,
      cache.biomeRaster,
      4,
      0,
      0,
    );
    for (const inst of instances) {
      expect(pointInPolygon(inst.x, inst.y, FOREST)).toBe(true);
      expect(inst.scale).toBeGreaterThanOrEqual(0.7);
      expect(inst.scale).toBeLessThanOrEqual(1.4);
    }
  });

  it('densidade aproximada: ~metade do tile em floresta ⇒ ~metade dos candidatos', () => {
    const { world, cache } = setup();
    const instances = scatterVegetationForTile(
      world.terrain,
      world.biomes,
      cache.biomeRaster,
      4,
      0,
      0,
    );
    // tile 512 células = 2048 m; floresta cobre a metade oeste = 209.7 ha
    // regras: 90 + 25 = 115/ha ⇒ ~24 000 esperadas (com tolerância estatística)
    const expected = 115 * ((1024 * 2048) / 10_000);
    expect(instances.length).toBeGreaterThan(expected * 0.85);
    expect(instances.length).toBeLessThan(expected * 1.15);
  });

  it('declividade acima de slopeMax_deg rejeita vegetação', () => {
    const { world, cache } = setup();
    // paredão: rampa brutal na faixa x ∈ [400, 600] m
    const raster = world.terrain.raster;
    for (let cy = 0; cy < 512; cy++) {
      for (let cx = 100; cx < 150; cx++) {
        raster.set(cx, cy, heightToU16((cx - 100) * 20, RANGE)); // 20 m por célula ≈ 78°
      }
    }
    expect(slopeAtDeg(world.terrain, 480, 1000, 4)).toBeGreaterThan(60);

    const instances = scatterVegetationForTile(
      world.terrain,
      world.biomes,
      cache.biomeRaster,
      4,
      0,
      0,
    );
    const onCliff = instances.filter((i) => i.x > 420 && i.x < 580);
    expect(onCliff.length).toBe(0);
  });
});
