import { describe, expect, it } from 'vitest';
import { TerrainStats, TsRasterKernels, WorldData, createWorldConfig, u16ToHeight } from '../core';
import { autoZFactor, defaultRampColor, hillshadeFactor } from './shading';
import { contourInterval } from './canvas2d/ContourOverlay';
import { altitudeColorAt } from './lenses/lenses';

/**
 * Teste de PERCEPÇÃO (P0-8): o usuário consegue VER o relevo?
 *
 * O bug do "terreno verde chapado" passou por 4.000 linhas de teste porque
 * todos verificavam dados e nenhum verificava exibição: marching squares
 * certo (desenhando UMA curva), rampa certa (com o range errado). Este
 * arquivo trava os três sintomas de uma vez, no cenário real das capturas:
 * mundo de 16 km, heightRange −200..1800, relevo esculpido de ±40 m.
 */

const RANGE = { min_m: -200, max_m: 1800 };

const makeScreenshotWorld = () => {
  const world = new WorldData(
    createWorldConfig({
      projectName: 'Percepção',
      extent: { width_m: 16000, height_m: 16000 },
      terrainResolution_m: 4,
      heightRange: RANGE,
    }),
  );
  const kernels = new TsRasterKernels();
  const u16PerMeter = 65535 / 2000;
  // a colina SUAVE das capturas: +40 m espalhados por 2 km de raio — o
  // gradiente físico fica em ~1,4°, exatamente o caso invisível sem z-factor
  kernels.applyRaise(
    world.terrain.raster,
    { cx_cells: 2000, cy_cells: 2000, radius_cells: 500, strength: 1, falloff: 'smooth' },
    Math.round(40 * u16PerMeter),
  );
  world.terrain.raster.consumeDirty();
  return world;
};

describe('percepção: colina de 40 m num mundo de 16 km TEM que aparecer', () => {
  const world = makeScreenshotWorld();
  const stats = new TerrainStats(world.terrain, world.config);
  const res = world.config.terrainResolution_m;
  const heightAt = (cx: number, cy: number) => u16ToHeight(world.terrain.raster.get(cx, cy), RANGE);

  it('TerrainStats enxerga a faixa REAL (~0..40 m), não o heightRange', () => {
    const data = stats.dataRange();
    expect(data.min_m).toBeGreaterThan(-1);
    expect(data.max_m).toBeGreaterThan(35);
    expect(data.max_m).toBeLessThan(45);
    expect(stats.relief_m()).toBeGreaterThan(35);
  });

  it('hillshade com z-factor AUTO: contraste > 10% (antes: 2%)', () => {
    const zFactor = autoZFactor(stats.gradientP95());
    expect(zFactor).toBeGreaterThan(1);

    let minShade = Infinity;
    let maxShade = -Infinity;
    // varre a encosta da colina em N pontos
    for (let cx = 1500; cx <= 2500; cx += 25) {
      for (let cy = 1500; cy <= 2500; cy += 25) {
        const gx = (heightAt(cx + 1, cy) - heightAt(cx - 1, cy)) / (2 * res);
        const gy = (heightAt(cx, cy + 1) - heightAt(cx, cy - 1)) / (2 * res);
        const shade = hillshadeFactor(gx, gy, zFactor);
        minShade = Math.min(minShade, shade);
        maxShade = Math.max(maxShade, shade);
      }
    }
    expect(maxShade - minShade).toBeGreaterThan(0.1);
  });

  it('sem o z-factor o mesmo terreno era invisível (documenta o bug)', () => {
    let minShade = Infinity;
    let maxShade = -Infinity;
    for (let cx = 1500; cx <= 2500; cx += 25) {
      const gx = (heightAt(cx + 1, 2000) - heightAt(cx - 1, 2000)) / (2 * res);
      const gy = (heightAt(cx, 2001) - heightAt(cx, 1999)) / (2 * res);
      const shade = hillshadeFactor(gx, gy, 1);
      minShade = Math.min(minShade, shade);
      maxShade = Math.max(maxShade, shade);
    }
    expect(maxShade - minShade).toBeLessThan(0.05); // o contraste que NÃO dava para ver
  });

  it('rampa padrão (lente Final): pico e base visivelmente distintos', () => {
    const display = stats.displayRange();
    const peak = defaultRampColor(heightAt(2000, 2000), display);
    const base = defaultRampColor(heightAt(3500, 3500), display);
    expect(rgbDistance(peak, base)).toBeGreaterThan(30);
  });

  it('lente Altitude com o range REAL: pico e base distintos', () => {
    const display = stats.displayRange();
    const peak = altitudeColorAt(heightAt(2000, 2000), display);
    const base = altitudeColorAt(0, display);
    expect(rgbDistance(peak, base)).toBeGreaterThan(60);
    // com o range de ARMAZENAMENTO, os mesmos pontos eram dois verdes gêmeos
    const wrong = rgbDistance(
      altitudeColorAt(heightAt(2000, 2000), RANGE),
      altitudeColorAt(0, RANGE),
    );
    expect(wrong).toBeLessThan(45); // documenta o bug corrigido
  });

  it('curvas de nível: ~15 curvas no relevo real (antes: exatamente 1)', () => {
    const mpp = 24; // o zoom das capturas (5 km ≈ 208 px)
    const relief = stats.relief_m();
    const interval = contourInterval(mpp, relief);
    const count = Math.floor(relief / interval);
    expect(count).toBeGreaterThanOrEqual(6);
    expect(count).toBeLessThanOrEqual(25);
    // e o piso pelo zoom ainda vale: muito perto, o intervalo não vira ruído
    expect(contourInterval(0.05, relief)).toBeGreaterThanOrEqual(interval / 10);
  });

  it('mapa PLANO: fallback de 50 m, sem divisão por zero, z auto = 1', () => {
    const flat = new WorldData(
      createWorldConfig({
        projectName: 'Plano',
        extent: { width_m: 4096, height_m: 4096 },
        terrainResolution_m: 4,
        heightRange: RANGE,
      }),
    );
    const flatStats = new TerrainStats(flat.terrain, flat.config);
    const display = flatStats.displayRange();
    expect(display.max_m - display.min_m).toBeCloseTo(50, 5);
    expect(autoZFactor(flatStats.gradientP95())).toBe(1);
    expect(Number.isFinite(defaultRampColor(0, display)[0])).toBe(true);
  });
});

function rgbDistance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
