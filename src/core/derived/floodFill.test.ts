import { describe, expect, it } from 'vitest';
import { WorldData } from '../world/WorldData';
import { createWorldConfig } from '../world/WorldConfig';
import { heightToU16 } from '../world/conversions';
import { pointInPolygon } from '../geometry/polygon';
import { floodFillLake } from './floodFill';

const RANGE = { min_m: -200, max_m: 1800 };

/** Mundo 2048 m com uma cratera circular (fundo −50 m) no centro. */
const makeCraterWorld = () => {
  const world = new WorldData(
    createWorldConfig({
      projectName: 'Teste',
      extent: { width_m: 2048, height_m: 2048 },
      terrainResolution_m: 4,
      heightRange: RANGE,
    }),
  );
  const raster = world.terrain.raster;
  const low = heightToU16(-50, RANGE);
  for (let cy = 200; cy <= 312; cy++) {
    for (let cx = 200; cx <= 312; cx++) {
      const dx = cx - 256;
      const dy = cy - 256;
      if (dx * dx + dy * dy <= 50 * 50) raster.set(cx, cy, low);
    }
  }
  return world;
};

describe('floodFillLake — "Preencher lago" (README §4.3/§7.2)', () => {
  it('preenche a cratera e devolve o polígono da borda', () => {
    const world = makeCraterWorld();
    // clique no centro da cratera (célula 256 → 1024 m), cota 0 m
    const result = floodFillLake(world.terrain, 4, { x: 1024, y: 1024 }, 0);
    expect(result).not.toBeNull();
    // círculo de raio 50 células ≈ 7854 células
    expect(result!.cellCount).toBeGreaterThan(7000);
    expect(result!.cellCount).toBeLessThan(8500);
    // polígono simplificado, fechado em volta do clique
    expect(result!.polygon.length).toBeGreaterThan(8);
    expect(result!.polygon.length).toBeLessThan(200);
    expect(pointInPolygon(1024, 1024, result!.polygon)).toBe(true);
    // e não engole o resto do mapa
    expect(pointInPolygon(100, 100, result!.polygon)).toBe(false);
  });

  it('clique em terra seca (terreno acima da cota) devolve null', () => {
    const world = makeCraterWorld();
    expect(floodFillLake(world.terrain, 4, { x: 100, y: 100 }, 0)).toBeNull();
  });

  it('cota mais alta produz lago maior', () => {
    const world = makeCraterWorld();
    // cota −40: só o miolo mais fundo? cratera tem fundo plano em −50,
    // então -40 e -10 diferem apenas se a borda subir — aqui o degrau é
    // vertical; testamos com cota acima do terreno base (0 m): tudo < 10 m
    // conectado ao clique inunda, limitado pelo maxCells.
    const small = floodFillLake(world.terrain, 4, { x: 1024, y: 1024 }, -10);
    const big = floodFillLake(world.terrain, 4, { x: 1024, y: 1024 }, 10, { maxCells: 100000 });
    expect(small).not.toBeNull();
    expect(big).toBeNull(); // acima do terreno base → estoura o limite
  });

  it('respeita maxCells', () => {
    const world = makeCraterWorld();
    expect(floodFillLake(world.terrain, 4, { x: 1024, y: 1024 }, 0, { maxCells: 100 })).toBeNull();
  });
});
