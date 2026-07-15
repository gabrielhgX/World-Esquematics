import { describe, expect, it } from 'vitest';
import { WorldData } from '../world/WorldData';
import { createWorldConfig } from '../world/WorldConfig';
import { heightToU16 } from '../world/conversions';

const makeWorld = () =>
  new WorldData(
    createWorldConfig({
      projectName: 'Teste',
      extent: { width_m: 4096, height_m: 4096 },
      terrainResolution_m: 4,
      heightRange: { min_m: -200, max_m: 1800 },
    }),
  );

describe('TerrainLayer (README §4.2)', () => {
  it('nasce com o mundo, como singleton da pilha de camadas', () => {
    const world = makeWorld();
    expect(world.terrain.type).toBe('terrain');
    expect(world.layers.getByType('terrain')).toEqual([world.terrain]);
    expect(world.layers.getById(world.terrain.id)).toBe(world.terrain);
  });

  it('mapa recém-criado: ~0 bytes e altura base 0 m em todo lugar', () => {
    const world = makeWorld();
    expect(world.terrain.raster.allocatedTileCount).toBe(0);
    expect(world.terrain.baseHeight_u16).toBe(heightToU16(0, { min_m: -200, max_m: 1800 }));
    expect(world.terrain.getHeight(2000, 2000)).toBeCloseTo(0, 1);
  });

  it('getHeight interpola bilinearmente entre as 4 células vizinhas', () => {
    const world = makeWorld();
    const range = { min_m: -200, max_m: 1800 };
    // célula (100,100) = 100 m; vizinhas ficam na base (0 m)
    world.terrain.raster.set(100, 100, heightToU16(100, range));
    // exatamente sobre a célula: ~100 m
    expect(world.terrain.getHeight(400, 400)).toBeCloseTo(100, 1);
    // meio do caminho até a vizinha: média com bilinear ao longo de um eixo
    expect(world.terrain.getHeight(402, 400)).toBeCloseTo(50, 1);
    // centro do quadrado: 1/4 da contribuição
    expect(world.terrain.getHeight(402, 402)).toBeCloseTo(25, 1);
  });
});
