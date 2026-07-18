import { describe, expect, it } from 'vitest';
import { WorldData } from '../core';
import { createWorldConfig } from '../core';
import { heightToU16 } from '../core';
import { computeMeasurements, sampleElevationProfile } from './MeasureTool';

const RANGE = { min_m: -200, max_m: 1800 };

/** Mundo com rampa linear em x: cota = x · 0,3 (30%). */
function rampWorld(): WorldData {
  const world = new WorldData(
    createWorldConfig({
      projectName: 'Medir',
      extent: { width_m: 4096, height_m: 4096 },
      terrainResolution_m: 4,
      heightRange: RANGE,
    }),
  );
  const raster = world.terrain.raster;
  for (let cy = 0; cy < 1024; cy++) {
    for (let cx = 0; cx < 1024; cx++) {
      raster.set(cx, cy, heightToU16(cx * 4 * 0.3, RANGE));
    }
  }
  return world;
}

describe('sampleElevationProfile — perfil de elevação (P3-3)', () => {
  it('amostra a linha a cada célula, distância monotônica de 0 ao total', () => {
    const world = rampWorld();
    const profile = sampleElevationProfile(
      world,
      [
        { x: 200, y: 500 },
        { x: 1200, y: 500 },
      ],
      false,
    )!;
    expect(profile).not.toBeNull();
    expect(profile.length_m).toBeCloseTo(1000, 6);
    // passo = resolução (4 m) → ~250 amostras + a inicial
    expect(profile.samples.length).toBeGreaterThan(200);
    // primeira amostra na origem, última no fim
    expect(profile.samples[0].d_m).toBe(0);
    expect(profile.samples[profile.samples.length - 1].d_m).toBeCloseTo(1000, 6);
    // distância estritamente crescente
    for (let i = 1; i < profile.samples.length; i++) {
      expect(profile.samples[i].d_m).toBeGreaterThan(profile.samples[i - 1].d_m);
    }
    // cotas: sobem com x (rampa) — min na esquerda (x=200), max na direita
    expect(profile.min_m).toBeCloseTo(200 * 0.3, 0);
    expect(profile.max_m).toBeCloseTo(1200 * 0.3, 0);
    expect(profile.samples[0].h_m).toBeLessThan(profile.samples[profile.samples.length - 1].h_m);
  });

  it('terreno plano: perfil sem relevo (min ≈ max), menos de 2 pontos = nulo', () => {
    const world = new WorldData(
      createWorldConfig({
        projectName: 'Plano',
        extent: { width_m: 1024, height_m: 1024 },
        terrainResolution_m: 4,
        heightRange: RANGE,
      }),
    );
    const flat = sampleElevationProfile(
      world,
      [
        { x: 100, y: 100 },
        { x: 500, y: 100 },
      ],
      false,
    )!;
    expect(flat.max_m - flat.min_m).toBeLessThan(0.05);
    expect(sampleElevationProfile(world, [{ x: 0, y: 0 }], false)).toBeNull();
  });

  it('o perfil e as medidas concordam: comprimento = distância plana', () => {
    const world = rampWorld();
    const pts = [
      { x: 200, y: 500 },
      { x: 1200, y: 500 },
    ];
    const profile = sampleElevationProfile(world, pts, false)!;
    const m = computeMeasurements(world, pts, false)!;
    expect(m.planar_m).toBeCloseTo(profile.length_m, 6);
    // real > plana numa rampa, inclinação média ≈ 30%
    expect(m.surface_m).toBeGreaterThan(m.planar_m);
    expect(m.averageGrade_pct).toBeCloseTo(30, 0);
  });
});
