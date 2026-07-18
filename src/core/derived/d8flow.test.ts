import { describe, expect, it } from 'vitest';
import { WorldData } from '../world/WorldData';
import { createWorldConfig } from '../world/WorldConfig';
import { heightToU16 } from '../world/conversions';
import { computeD8, suggestRivers, traceFlowNetwork } from './d8flow';

describe('computeD8 (README §4.3)', () => {
  it('rampa: tudo drena para a célula mais baixa', () => {
    // 1×5, alturas 40,30,20,10,0 → acumulação cresce rio abaixo
    const heights = Float64Array.from([40, 30, 20, 10, 0]);
    const { accumulation, direction } = computeD8(heights, 5, 1);
    expect(direction[0]).toBe(1);
    expect(direction[4]).toBe(-1); // fossa/foz
    expect(Array.from(accumulation)).toEqual([1, 2, 3, 4, 5]);
  });

  it('vale em V: as encostas drenam para o talvegue', () => {
    // 5×3: coluna central mais baixa e descendo para o sul
    const w = 5;
    const h = 3;
    const heights = new Float64Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        heights[y * w + x] = Math.abs(x - 2) * 10 + (h - y) * 1;
      }
    }
    const { accumulation } = computeD8(heights, w, h);
    // foz do talvegue (x=2, y=h-1) concentra a bacia inteira
    expect(accumulation[(h - 1) * w + 2]).toBe(w * h);
  });
});

describe('suggestRivers — "Sugerir rios" (README §4.3)', () => {
  it('encontra o rio no talvegue de um vale sintético, com cota decrescente', () => {
    const world = new WorldData(
      createWorldConfig({
        projectName: 'Teste',
        extent: { width_m: 2048, height_m: 2048 },
        terrainResolution_m: 4,
        heightRange: { min_m: -200, max_m: 1800 },
      }),
    );
    // vale em V: talvegue na coluna central, descendo para o sul (y=0).
    // Declividades com folga ampla sobre a quantização do uint16 (3 cm),
    // para a direção D8 não depender de desempate numérico.
    const raster = world.terrain.raster;
    const range = { min_m: -200, max_m: 1800 };
    for (let cy = 0; cy < 512; cy++) {
      for (let cx = 0; cx < 512; cx++) {
        const h = Math.abs(cx - 256) * 1.0 + cy * 0.3 + 10;
        raster.set(cx, cy, heightToU16(h, range));
      }
    }

    const rivers = suggestRivers(world.terrain, 4, {
      maxSide: 128,
      minAccumulationCells: 60,
      minLengthCells: 8,
    });
    expect(rivers.length).toBeGreaterThanOrEqual(1);

    const main = rivers[0];
    expect(main.nodes.length).toBeGreaterThanOrEqual(2);
    // corre pelo talvegue: x ≈ 1024 m (coluna 256 × 4 m)
    for (const node of main.nodes) {
      expect(Math.abs(node.x - 1024)).toBeLessThan(200);
    }
    // cota estritamente decrescente (README §4.3: surface_m DEVE decrescer)
    for (let i = 1; i < main.nodes.length; i++) {
      expect(main.nodes[i].surface_m).toBeLessThan(main.nodes[i - 1].surface_m);
    }
    // largura dentro dos limites
    for (const node of main.nodes) {
      expect(node.width_m).toBeGreaterThanOrEqual(4);
      expect(node.width_m).toBeLessThanOrEqual(60);
    }
  });

  it('terreno plano não sugere rio nenhum', () => {
    const world = new WorldData(
      createWorldConfig({
        projectName: 'Teste',
        extent: { width_m: 1024, height_m: 1024 },
        terrainResolution_m: 4,
        heightRange: { min_m: -200, max_m: 1800 },
      }),
    );
    expect(suggestRivers(world.terrain, 4, { maxSide: 64 })).toEqual([]);
  });
});

describe('traceFlowNetwork — lente de Hidrografia (P3-2)', () => {
  it('traça o talvegue de um vale, com acumulação crescendo rio abaixo', () => {
    const world = new WorldData(
      createWorldConfig({
        projectName: 'Teste',
        extent: { width_m: 2048, height_m: 2048 },
        terrainResolution_m: 4,
        heightRange: { min_m: -200, max_m: 1800 },
      }),
    );
    const raster = world.terrain.raster;
    const range = { min_m: -200, max_m: 1800 };
    // vale em V descendo para o sul (y=0), talvegue na coluna central
    for (let cy = 0; cy < 512; cy++) {
      for (let cx = 0; cx < 512; cx++) {
        const h = Math.abs(cx - 256) * 1.0 + cy * 0.3 + 10;
        raster.set(cx, cy, heightToU16(h, range));
      }
    }

    const { channels, maxAccumulation } = traceFlowNetwork(world.terrain, 4, {
      maxSide: 128,
      minAccumulationCells: 60,
      minLengthCells: 6,
    });
    expect(channels.length).toBeGreaterThanOrEqual(1);
    expect(maxAccumulation).toBeGreaterThan(60); // a foz drena a bacia

    // o maior talvegue corre pela coluna central (x ≈ 1024 m)
    const main = channels.reduce((a, b) => (a.points.length >= b.points.length ? a : b));
    expect(main.points.length).toBeGreaterThanOrEqual(2);
    for (const [x] of main.points) {
      expect(Math.abs(x - 1024)).toBeLessThan(220);
    }
    // acumulação por ponto acompanha a polilinha 1-a-1
    expect(main.accumulation.length).toBe(main.points.length);
    // rio abaixo (y menor) drena mais que rio acima — a foz é o maior
    const mouth = Math.max(...main.accumulation);
    const spring = Math.min(...main.accumulation);
    expect(mouth).toBeGreaterThan(spring);
  });

  it('terreno plano não tem rede de drenagem', () => {
    const world = new WorldData(
      createWorldConfig({
        projectName: 'Teste',
        extent: { width_m: 1024, height_m: 1024 },
        terrainResolution_m: 4,
        heightRange: { min_m: -200, max_m: 1800 },
      }),
    );
    expect(traceFlowNetwork(world.terrain, 4, { maxSide: 64 }).channels).toEqual([]);
  });
});
