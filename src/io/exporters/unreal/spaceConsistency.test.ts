import { describe, expect, it } from 'vitest';
import { WorldData, createWorldConfig } from '../../../core';
import { buildLandscapePlan } from './heightmap';
import { northSpan_m, positionToUE } from './unrealSpace';

/**
 * P1-5 — célula vs. vértice: o Landscape e os objetos/estradas TÊM que usar
 * a mesma convenção "amostra no canto". O grid tem N amostras cobrindo o
 * vão (N−1)·res; usar a extensão N·res num dos caminhos e não no outro
 * desalinhava objetos do relevo em ~1 célula na borda. Este teste amarra
 * `positionToUE` (vetores) ao `buildLandscapePlan` (heightmap): os cantos
 * dos dados caem exatamente nos vértices extremos do Landscape.
 */

const makeWorld = (extent = 2020, res = 4) =>
  new WorldData(
    createWorldConfig({
      projectName: 'Consistência',
      extent: { width_m: extent, height_m: extent },
      terrainResolution_m: res,
      heightRange: { min_m: -200, max_m: 1800 },
    }),
  );

describe('render ↔ export: mesma convenção de amostragem (P1-5)', () => {
  it('cantos dos dados caem nos vértices extremos do Landscape (sem resample)', () => {
    const world = makeWorld(); // grid 505² = tamanho válido, sem resample
    const plan = buildLandscapePlan(world);
    const res = world.config.terrainResolution_m;
    const w = world.terrain.raster.widthCells;
    const h = world.terrain.raster.heightCells;

    // vão que o Landscape cobre em uu (vértice 0 → vértice N−1)
    const landscapeSpanX_uu = plan.scale.x * (plan.resolutionX - 1);
    const landscapeSpanY_uu = plan.scale.y * (plan.resolutionY - 1);

    const ns = northSpan_m(world);
    // canto SUDOESTE dos dados (x=0, y=0) → origem +Y máximo (sul) do Landscape
    const sw = positionToUE(0, 0, 0, ns);
    expect(sw.x).toBeCloseTo(0, 6);
    expect(sw.y).toBeCloseTo(landscapeSpanY_uu, 6);
    // canto NORDESTE dos dados → X máximo, Y=0 (norte = row 0)
    const ne = positionToUE((w - 1) * res, (h - 1) * res, 0, ns);
    expect(ne.x).toBeCloseTo(landscapeSpanX_uu, 6);
    expect(ne.y).toBeCloseTo(0, 6);
  });

  it('o CENTRO dos dados cai no centro do Landscape', () => {
    const world = makeWorld();
    const plan = buildLandscapePlan(world);
    const res = world.config.terrainResolution_m;
    const cx = ((world.terrain.raster.widthCells - 1) * res) / 2;
    const cy = ((world.terrain.raster.heightCells - 1) * res) / 2;
    const p = positionToUE(cx, cy, 0, northSpan_m(world));
    expect(p.x).toBeCloseTo((plan.scale.x * (plan.resolutionX - 1)) / 2, 6);
    expect(p.y).toBeCloseTo((plan.scale.y * (plan.resolutionY - 1)) / 2, 6);
  });

  it('quads redondos: 504 quads × 4 m dão escala 400 uu (P1-7)', () => {
    const plan = buildLandscapePlan(makeWorld());
    expect(plan.scale.x).toBeCloseTo(400, 9);
    expect(plan.scale.y).toBeCloseTo(400, 9);
  });
});
