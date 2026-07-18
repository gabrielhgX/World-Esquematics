import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  WorldData,
  createBiomePolygon,
  createWorldConfig,
  heightToU16,
  lineAsCubic,
  newId,
  planRoadPath,
} from '../../../core';
import { decodeGrayPng8 } from '../../png/pngTestUtils';
import { UnrealExporter } from './UnrealExporter';

/**
 * Round-trip do mapa "L" assimétrico (README §11, item 29): exporta o pacote
 * COMPLETO e valida — sem eixo espelhado, sem mapa achatado — inclusive
 * rodando o plugin importador em --dry-run e conferindo o plano que ele
 * montaria na engine.
 */

// extent 2020 m @ 4 m ⇒ grid 505² = tamanho EXATO de Landscape (sem
// reamostragem — asserções pixel a pixel); range 512 m ⇒ ZScale 100.
const EXTENT = 2020;
const RANGE = { min_m: -256, max_m: 256 };
const HIGH_M = 100;

const makeLWorld = () => {
  const world = new WorldData(
    createWorldConfig({
      projectName: 'Mapa L',
      extent: { width_m: EXTENT, height_m: EXTENT },
      terrainResolution_m: 4,
      heightRange: RANGE,
    }),
  );
  const high = heightToU16(HIGH_M, RANGE);
  const raster = world.terrain.raster;
  // "L": barra vertical no OESTE (inteira) + barra horizontal no SUL
  for (let y = 0; y < 505; y++) for (let x = 0; x < 50; x++) raster.set(x, y, high);
  for (let y = 0; y < 50; y++) for (let x = 0; x < 253; x++) raster.set(x, y, high);
  raster.consumeDirty();

  // bioma com feather de 40 m, longe do L (área plana ⇒ scatter aceita)
  world.biomes.scatterSeed = 777;
  world.biomes.addPolygon(
    createBiomePolygon(
      1,
      [
        [800, 800],
        [1600, 800],
        [1600, 1600],
        [800, 1600],
      ],
      40,
    ),
  );

  world.objects.add({
    id: newId(),
    type: 'tower_01',
    pos: { x: 400, y: 1800 },
    z_offset_m: 0,
    rotation_deg: 30,
    scale: { x: 1, y: 1, z: 2 },
    alignToSlope: false,
    tags: ['marco'],
  });
  world.pois.add({
    id: newId(),
    name: 'Capital',
    icon: '★',
    pos: { x: 1000, y: 500 },
    properties: {},
  });
  world.regions.add({
    id: newId(),
    name: 'Reino',
    description: '',
    polygon: [
      [0, 0],
      [600, 0],
      [600, 600],
      [0, 600],
    ],
    color: '#b06ab0',
    properties: {},
  });

  const line = lineAsCubic({ x: 400, y: 400 }, { x: 1600, y: 400 });
  const plan = planRoadPath(
    world.roads,
    [
      {
        fromNodeId: null,
        fromPos: line.p0,
        toNodeId: null,
        toPos: line.p1,
        c1: line.c1,
        c2: line.c2,
      },
    ],
    { width_m: 8, type: 'dirt', material: 'road_dirt', carveTerrain: true, maxGrade_pct: 12 },
  );
  plan.nodesToAdd.forEach((n) => world.roads.addNode(n));
  plan.edgesToAdd.forEach((e) => world.roads.addEdge(e));

  world.water.setSeaLevel(-10);
  world.water.addBody({
    id: newId(),
    kind: 'lake',
    surface_m: 20,
    polygon: [
      [1700, 1700],
      [1900, 1700],
      [1900, 1900],
      [1700, 1900],
    ],
    material: 'water_lake',
  });
  world.water.addRiver({
    id: newId(),
    nodes: [
      { x: 300, y: 1900, width_m: 10, surface_m: 50 },
      { x: 600, y: 1700, width_m: 12, surface_m: 30 },
    ],
    carveDepth_m: 2,
  });
  return world;
};

const exporter = new UnrealExporter();
const bundlePromise = exporter.export(makeLWorld());
const fileOf = async (path: string) => {
  const bundle = await bundlePromise;
  const file = bundle.files.find((f) => f.path === path);
  if (!file) throw new Error(`Arquivo ausente no export: ${path}`);
  return file.data;
};
const jsonOf = async (path: string) => JSON.parse(new TextDecoder().decode(await fileOf(path)));

const W = 505;
// P1-5: o flip N-S usa o VÃO amostrado (heightCells−1)·res, não a extensão
const NORTH_SPAN = 504 * 4; // = 2016 m
const pixel16 = (r16: Uint8Array, col: number, row: number) =>
  new DataView(r16.buffer, r16.byteOffset).getUint16((row * W + col) * 2, true);

describe('round-trip "L" — exportador Unreal completo (item 29)', () => {
  it('o pacote traz todos os arquivos do §9.1', async () => {
    const bundle = await bundlePromise;
    const paths = bundle.files.map((f) => f.path);
    for (const expected of [
      'heightmap.r16',
      'weightmaps/Floresta.png',
      'objects.json',
      'scatter.csv',
      'splines.json',
      'water.json',
      'metadata.json',
      'unreal_import.json',
    ]) {
      expect(paths).toContain(expected);
    }
  });

  it('heightmap: "L" sem espelhamento, ZScale 100 sem achatamento', async () => {
    const r16 = await fileOf('heightmap.r16');
    const high = heightToU16(HIGH_M, RANGE);
    const base = heightToU16(0, RANGE);
    // linha 0 = NORTE: barra oeste em todas as linhas; barra sul só embaixo
    expect(Math.abs(pixel16(r16, 20, 10) - high)).toBeLessThan(3); // noroeste
    expect(Math.abs(pixel16(r16, 20, W - 10) - high)).toBeLessThan(3); // sudoeste
    expect(Math.abs(pixel16(r16, 150, W - 10) - high)).toBeLessThan(3); // sul
    expect(Math.abs(pixel16(r16, 150, 10) - base)).toBeLessThan(3); // norte vazio
    expect(Math.abs(pixel16(r16, 400, 250) - base)).toBeLessThan(3); // leste vazio

    const manifest = await jsonOf('unreal_import.json');
    expect(manifest.formatVersion).toBe(2);
    expect(manifest.landscape.scale.z).toBeCloseTo(100, 9); // range 512 m
    expect(manifest.landscape.location.z).toBeCloseTo(0, 6);
    expect(manifest.landscape.resolutionX).toBe(W);
  });

  it('weightmap: 255 dentro, 0 fora, rampa de feather cruzando a borda', async () => {
    const png = await fileOf('weightmaps/Floresta.png');
    const { width, height, pixels } = await decodeGrayPng8(png);
    expect(width).toBe(W);
    expect(height).toBe(W);
    const at = (x_m: number, y_m: number) =>
      pixels[(W - 1 - Math.round(y_m / 4)) * W + Math.round(x_m / 4)]; // linha 0 = norte
    expect(at(1200, 1200)).toBe(255); // centro do polígono
    expect(at(200, 200)).toBe(0); // longe
    expect(Math.abs(at(800, 1200) - 128)).toBeLessThanOrEqual(30); // borda ≈ 0.5
    // rampa monotônica através da borda oeste do polígono (feather 40 m)
    expect(at(760, 1200)).toBeLessThan(at(800, 1200));
    expect(at(800, 1200)).toBeLessThan(at(840, 1200));
  });

  it('objetos e POIs: flip N-S e yaw invertido (gotcha #3)', async () => {
    const objects = await jsonOf('objects.json');
    const tower = objects.objects[0];
    expect(tower.position.x).toBeCloseTo(400 * 100, 6);
    expect(tower.position.y).toBeCloseTo((NORTH_SPAN - 1800) * 100, 6);
    expect(Math.abs(tower.position.z)).toBeLessThan(1); // terreno plano ali
    expect(tower.yaw_deg).toBe(-30);
    expect(tower.scale.z).toBe(2);

    const metadata = await jsonOf('metadata.json');
    expect(metadata.pois[0].position.y).toBeCloseTo((NORTH_SPAN - 500) * 100, 6);
    expect(metadata.regions[0].name).toBe('Reino');
  });

  it('scatter: determinístico e contido no polígono do bioma', async () => {
    const csv = new TextDecoder().decode(await fileOf('scatter.csv'));
    const rows = csv.trim().split('\n');
    expect(rows[0]).toBe('type,x,y,z,yaw,scale');
    expect(rows.length).toBeGreaterThan(1000); // 64 ha de Floresta
    for (const row of rows.slice(1)) {
      const [, x, y] = row.split(',').map(Number);
      expect(x).toBeGreaterThanOrEqual(800 * 100);
      expect(x).toBeLessThanOrEqual(1600 * 100);
      expect(y).toBeGreaterThanOrEqual((NORTH_SPAN - 1600) * 100);
      expect(y).toBeLessThanOrEqual((NORTH_SPAN - 800) * 100);
    }
    // mesmo mundo ⇒ mesmos bytes
    const again = await exporter.export(makeLWorld());
    const csvAgain = new TextDecoder().decode(
      again.files.find((f) => f.path === 'scatter.csv')!.data,
    );
    expect(csvAgain).toBe(csv);
  });

  it('splines e água: larguras/cotas em uu, z no terreno', async () => {
    const splines = await jsonOf('splines.json');
    expect(splines.splines.length).toBe(1);
    const road = splines.splines[0];
    expect(road.width_uu).toBe(800);
    expect(road.points[0].y).toBeCloseTo((NORTH_SPAN - 400) * 100, 6);
    expect(Math.abs(road.points[0].z)).toBeLessThan(1);

    const water = await jsonOf('water.json');
    expect(water.ocean.surfaceZ_uu).toBe(-1000);
    expect(water.lakes[0].surfaceZ_uu).toBe(2000);
    expect(water.rivers[0].nodes[0].width_uu).toBe(1000);
  });
});

const hasPython = (() => {
  try {
    execFileSync('python3', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!hasPython)('plugin importador em --dry-run (item 28)', () => {
  it('o plano do importador bate com o export, tangentes de Bézier corretas', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wesq-unreal-'));
    tempDirs.push(dir);
    const bundle = await bundlePromise;
    for (const file of bundle.files) {
      mkdirSync(dirname(join(dir, file.path)), { recursive: true });
      writeFileSync(join(dir, file.path), file.data);
    }

    const planPath = join(dir, 'plan.json');
    const stdout = execFileSync(
      'python3',
      ['unreal-plugin/import_world.py', '--bundle', dir, '--dry-run', '--plan-out', planPath],
      { cwd: process.cwd(), encoding: 'utf-8' },
    );
    expect(stdout).toContain('ZScale 100.00');

    const plan = JSON.parse(readFileSync(planPath, 'utf-8'));
    expect(plan.landscape.scale.z).toBeCloseTo(100, 9);
    expect(plan.landscape.instructions).toContain('505x505');

    // spawns = 1 objeto manual + vegetação + 1 POI
    const manifest = await jsonOf('unreal_import.json');
    expect(plan.counts.spawns).toBe(1 + manifest.counts.scatterInstances + 1);
    const tower = plan.spawns.find((s: { kind: string }) => s.kind === 'object');
    expect(tower.yaw_deg).toBe(-30);
    expect(tower.location.y).toBeCloseTo((NORTH_SPAN - 1800) * 100, 6);
    const poi = plan.spawns.find((s: { kind: string }) => s.kind === 'poi');
    expect(poi.label).toBe('★ Capital');

    // tangentes: hermite da UE com 3·(c1−p0) reproduz a Bézier exportada
    const splines = await jsonOf('splines.json');
    const src = splines.splines[0];
    const road = plan.roads[0];
    expect(road.points[0].tangent.x).toBeCloseTo(3 * (src.points[1].x - src.points[0].x), 6);
    expect(road.points[1].tangent.x).toBeCloseTo(3 * (src.points[3].x - src.points[2].x), 6);
    expect(road.points[0].position.y).toBeCloseTo(src.points[0].y, 6);
  });

  it('--max-scatter limita a vegetação e avisa', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wesq-unreal-cap-'));
    tempDirs.push(dir);
    const bundle = await bundlePromise;
    for (const file of bundle.files) {
      mkdirSync(dirname(join(dir, file.path)), { recursive: true });
      writeFileSync(join(dir, file.path), file.data);
    }
    const planPath = join(dir, 'plan.json');
    execFileSync(
      'python3',
      // prettier-ignore
      ['unreal-plugin/import_world.py', '--bundle', dir, '--dry-run', '--plan-out', planPath, '--max-scatter', '10'],
      { cwd: process.cwd(), encoding: 'utf-8' },
    );
    const plan = JSON.parse(readFileSync(planPath, 'utf-8'));
    expect(plan.counts.spawns).toBe(1 + 10 + 1);
    expect(plan.warnings.length).toBe(1);
    expect(plan.counts.scatterTotal).toBeGreaterThan(10);
  });
});
