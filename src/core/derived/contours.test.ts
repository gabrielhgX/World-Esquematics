import { describe, expect, it } from 'vitest';
import { computeTileContours } from './contours';
import { ContourCache } from './ContourCache';
import { WorldData } from '../world/WorldData';
import { createWorldConfig } from '../world/WorldConfig';
import { heightToU16 } from '../world/conversions';

describe('marching squares (README §6.2)', () => {
  it('terreno plano não gera contornos', () => {
    const result = computeTileContours({
      sampleHeight: () => 100,
      cellX0: 0,
      cellY0: 0,
      squaresX: 8,
      squaresY: 8,
      resolution_m: 4,
      interval_m: 10,
    });
    expect(result.levels).toEqual([]);
  });

  it('rampa linear gera linhas verticais nos níveis, com espaçamento certo', () => {
    // h = x_células × 10 m: níveis 20 m e 40 m cruzam em x = 2 e x = 4
    const result = computeTileContours({
      sampleHeight: (cx) => cx * 10,
      cellX0: 0,
      cellY0: 0,
      squaresX: 5,
      squaresY: 2,
      resolution_m: 4,
      interval_m: 20,
    });
    const levels = result.levels.map((l) => l.level_m);
    expect(levels).toContain(20);
    expect(levels).toContain(40);
    const l20 = result.levels.find((l) => l.level_m === 20)!;
    // todos os pontos do nível 20 m ficam em x = 2 células × 4 m = 8 m
    for (let p = 0; p < l20.segments.length; p += 2) {
      expect(l20.segments[p]).toBeCloseTo(8, 9);
    }
    // 2 linhas de quadrados → 2 segmentos → 8 números
    expect(l20.segments.length).toBe(8);
  });

  it('pico num único canto gera um segmento com interpolação correta', () => {
    // canto A=(0,0) com 10 m, resto 0 — nível 5 m cruza no meio das arestas
    const result = computeTileContours({
      sampleHeight: (cx, cy) => (cx === 0 && cy === 0 ? 10 : 0),
      cellX0: 0,
      cellY0: 0,
      squaresX: 1,
      squaresY: 1,
      resolution_m: 4,
      interval_m: 5,
    });
    expect(result.levels.length).toBe(1);
    const seg = result.levels[0].segments;
    expect(seg.length).toBe(4);
    const points = [
      [seg[0], seg[1]],
      [seg[2], seg[3]],
    ].sort((a, b) => a[0] - b[0]);
    expect(points[0]).toEqual([0, 2]); // aresta esquerda, meio
    expect(points[1]).toEqual([2, 0]); // aresta inferior, meio
  });

  it('marca linha-índice a cada 5ª (README §6.2)', () => {
    const result = computeTileContours({
      sampleHeight: (cx) => cx * 30,
      cellX0: 0,
      cellY0: 0,
      squaresX: 20,
      squaresY: 1,
      resolution_m: 4,
      interval_m: 20,
    });
    const l100 = result.levels.find((l) => l.level_m === 100)!;
    const l20 = result.levels.find((l) => l.level_m === 20)!;
    expect(l100.isIndex).toBe(true); // 100 = 5 × 20
    expect(l20.isIndex).toBe(false);
  });
});

describe('ContourCache — invalidação por dirty tile (D6)', () => {
  const makeWorld = () =>
    new WorldData(
      createWorldConfig({
        projectName: 'Teste',
        extent: { width_m: 8192, height_m: 8192 },
        terrainResolution_m: 4,
        heightRange: { min_m: -200, max_m: 1800 },
      }),
    );

  it('memoiza por tile e reflete o relevo após invalidar', () => {
    const world = makeWorld();
    const cache = new ContourCache(world.terrain, 4);

    expect(cache.getTile(0, 0, 20).levels).toEqual([]); // plano
    expect(cache.cachedTileCount).toBe(1);

    const range = { min_m: -200, max_m: 1800 };
    world.terrain.raster.set(100, 100, heightToU16(100, range));
    // sem invalidar, continua servindo o cache antigo
    expect(cache.getTile(0, 0, 20).levels).toEqual([]);

    cache.invalidate(world.terrain.raster.consumeDirty());
    expect(cache.getTile(0, 0, 20).levels.length).toBeGreaterThan(0);
  });

  it('tile sujo invalida também os vizinhos de costura (esquerda/abaixo/diagonal)', () => {
    const world = makeWorld();
    const cache = new ContourCache(world.terrain, 4);
    cache.getTile(0, 0, 20);
    cache.getTile(1, 0, 20);
    cache.getTile(0, 1, 20);
    cache.getTile(1, 1, 20);
    cache.getTile(2, 2, 20); // não costura com (1,1)
    expect(cache.cachedTileCount).toBe(5);

    cache.invalidate(['1,1']);
    expect(cache.cachedTileCount).toBe(1); // só (2,2) sobrevive
  });

  it('trocar o intervalo (zoom) limpa o cache', () => {
    const world = makeWorld();
    const cache = new ContourCache(world.terrain, 4);
    cache.getTile(0, 0, 100);
    cache.getTile(1, 0, 100);
    expect(cache.cachedTileCount).toBe(2);
    cache.getTile(0, 0, 20);
    expect(cache.cachedTileCount).toBe(1);
  });
});
