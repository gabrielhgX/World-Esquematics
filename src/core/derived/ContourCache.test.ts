import { describe, expect, it } from 'vitest';
import { TerrainLayer } from '../layers/TerrainLayer';
import { createWorldConfig } from '../world/WorldConfig';
import { heightToU16 } from '../world/conversions';
import { ContourCache } from './ContourCache';

/**
 * P1-4: o ContourCache pula o marching squares nos tiles onde nenhum nível
 * cruza — mas nunca some com uma curva na costura entre tiles.
 */

const RANGE = { min_m: -200, max_m: 1800 };

const makeTerrain = () => {
  const config = createWorldConfig({
    projectName: 'Contornos',
    extent: { width_m: 8192, height_m: 8192 }, // 2048² células = 4×4 tiles
    terrainResolution_m: 4,
    heightRange: RANGE,
  });
  return { terrain: new TerrainLayer(config, 't'), res: config.terrainResolution_m };
};

describe('ContourCache — skip por min/max do tile (P1-4)', () => {
  it('tile plano (só baseHeight) não gera nível nenhum', () => {
    const { terrain, res } = makeTerrain();
    const cache = new ContourCache(terrain, res);
    // tile 2,2 nunca foi tocado → fica na cota base (0 m); intervalo 5 m
    expect(cache.getTile(2, 2, 5).levels.length).toBe(0);
  });

  it('morro localizado gera curvas onde cruza e nada nos tiles planos', () => {
    const { terrain, res } = makeTerrain();
    // um morro de +30 m dentro do tile 0,0 (células 100..400)
    for (let cy = 100; cy <= 400; cy++) {
      for (let cx = 100; cx <= 400; cx++) {
        const d = Math.hypot(cx - 250, cy - 250);
        if (d < 150) {
          const h = 30 * (1 - d / 150);
          terrain.raster.set(cx, cy, heightToU16(h, RANGE));
        }
      }
    }
    const cache = new ContourCache(terrain, res);
    // tile do morro: várias curvas (0..30 m a cada 5 m)
    expect(cache.getTile(0, 0, 5).levels.length).toBeGreaterThan(2);
    // tile distante e plano: pulado, zero curvas
    expect(cache.getTile(3, 3, 5).levels.length).toBe(0);
  });

  it('costura: uma curva bem na borda leste do tile NÃO é engolida', () => {
    const { terrain, res } = makeTerrain();
    // degrau vertical logo APÓS a borda do tile 0 (célula 512 = 1º do tile 1):
    // a última coluna do tile 0 (511) e a 1ª do tile 1 (512) diferem, então a
    // curva passa exatamente na costura, cujos cantos o tile 0 lê.
    for (let cy = 0; cy < 2048; cy++) {
      for (let cx = 512; cx < 2048; cx++) {
        terrain.raster.set(cx, cy, heightToU16(20, RANGE));
      }
    }
    const cache = new ContourCache(terrain, res);
    // o tile 0 é "plano" nos SEUS dados (tudo 0 m), mas a costura com o leste
    // sobe a 20 m — a curva de 10 m tem que aparecer, não ser pulada
    expect(cache.getTile(0, 0, 10).levels.length).toBeGreaterThan(0);
  });
});
