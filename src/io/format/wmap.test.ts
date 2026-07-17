import { describe, expect, it } from 'vitest';
import {
  TsRasterKernels,
  WorldData,
  createBiomePolygon,
  createWorldConfig,
  lineAsCubic,
  newId,
  planRoadPath,
} from '../../core';
import { loadWmap, migrateManifest, saveWmap, WMAP_FORMAT_VERSION } from './wmap';
import { readZip, writeZipCompressed } from './zip';

const RANGE = { min_m: -200, max_m: 1800 };

/** Mundo com um pouco de tudo, para o round-trip. */
const makeRichWorld = () => {
  const world = new WorldData(
    createWorldConfig({
      projectName: 'Mundo Completo',
      extent: { width_m: 4096, height_m: 4096 },
      terrainResolution_m: 4,
      heightRange: RANGE,
    }),
  );

  // relevo esculpido em dois tiles
  const kernels = new TsRasterKernels();
  kernels.applyRaise(
    world.terrain.raster,
    { cx_cells: 100, cy_cells: 100, radius_cells: 30, strength: 1, falloff: 'smooth' },
    5000,
  );
  kernels.applyRaise(
    world.terrain.raster,
    { cx_cells: 600, cy_cells: 600, radius_cells: 20, strength: 1, falloff: 'constant' },
    3000,
  );
  world.terrain.raster.consumeDirty();

  // água: mar (ligado explicitamente), lago e rio
  world.water.setSeaLevel(-5);
  world.water.setOceanEnabled(true);
  world.water.addBody({
    id: newId(),
    kind: 'lake',
    surface_m: 42,
    polygon: [
      [1000, 1000],
      [1400, 1000],
      [1400, 1400],
      [1000, 1400],
    ],
    material: 'water_lake',
  });
  world.water.addRiver({
    id: newId(),
    nodes: [
      { x: 100, y: 3000, width_m: 10, surface_m: 80 },
      { x: 900, y: 2500, width_m: 14, surface_m: 60 },
    ],
    carveDepth_m: 2,
  });

  // estradas com interseção real
  const props = {
    width_m: 8,
    type: 'dirt' as const,
    material: 'road_dirt',
    carveTerrain: true,
    maxGrade_pct: 12,
  };
  const seg = (x0: number, y0: number, x1: number, y1: number) => {
    const line = lineAsCubic({ x: x0, y: y0 }, { x: x1, y: y1 });
    return {
      fromNodeId: null,
      fromPos: line.p0,
      toNodeId: null,
      toPos: line.p1,
      c1: line.c1,
      c2: line.c2,
    };
  };
  const planA = planRoadPath(world.roads, [seg(200, 2000, 1800, 2000)], props);
  planA.nodesToAdd.forEach((n) => world.roads.addNode(n));
  planA.edgesToAdd.forEach((e) => world.roads.addEdge(e));
  const planB = planRoadPath(world.roads, [seg(1000, 1600, 1000, 2400)], props);
  planB.edgesToRemove.forEach((e) => world.roads.removeEdge(e.id));
  planB.nodesToAdd.forEach((n) => world.roads.addNode(n));
  planB.edgesToAdd.forEach((e) => world.roads.addEdge(e));

  // região, POI, objeto, bioma
  world.regions.add({
    id: newId(),
    name: 'Reino',
    description: 'terras altas',
    polygon: [
      [0, 0],
      [800, 0],
      [800, 800],
      [0, 800],
    ],
    color: '#b06ab0',
    properties: { governo: 'monarquia' },
  });
  world.pois.add({
    id: newId(),
    name: 'Capital',
    icon: '★',
    pos: { x: 2000, y: 2000 },
    properties: {},
  });
  world.objects.add({
    id: newId(),
    type: 'tower_01',
    pos: { x: 1500, y: 1500 },
    z_offset_m: 2,
    rotation_deg: 30,
    scale: { x: 1, y: 1, z: 2 },
    alignToSlope: true,
    tags: ['marco'],
  });
  world.biomes.scatterSeed = 4242;
  world.biomes.addPolygon(
    createBiomePolygon(
      1,
      [
        [2000, 2000],
        [3000, 2000],
        [3000, 3000],
        [2000, 3000],
      ],
      24,
    ),
  );

  // metadados de camada (Outliner)
  world.roads.name = 'Vias do Reino';
  world.pois.visible = false;
  world.objects.locked = true;
  return world;
};

describe('.wmap — save/load com round-trip (README §8)', () => {
  it('reconstrói o mundo inteiro: relevo, água, grafo, vetores, biomas', async () => {
    const original = makeRichWorld();
    const bytes = await saveWmap(original);
    const restored = await loadWmap(bytes);

    // config preservado (inclusive createdAt)
    expect(restored.config).toEqual(original.config);

    // relevo: alturas exatas nos dois montes e na base
    for (const [cx, cy] of [
      [100, 100],
      [600, 600],
      [90, 110],
      [500, 100],
    ] as const) {
      expect(restored.terrain.raster.get(cx, cy)).toBe(original.terrain.raster.get(cx, cy));
    }
    expect(restored.terrain.raster.allocatedTileCount).toBe(
      original.terrain.raster.allocatedTileCount,
    );

    // água
    expect(restored.water.seaLevel_m).toBe(-5);
    expect(restored.water.oceanEnabled).toBe(true);
    expect(restored.water.lakes.length).toBe(1);
    expect(restored.water.lakes[0].surface_m).toBe(42);
    expect(restored.water.rivers[0].nodes.length).toBe(2);

    // grafo planar: 4 arestas + 5 nós (com a interseção)
    expect(restored.roads.edges.size).toBe(original.roads.edges.size);
    expect(restored.roads.nodes.size).toBe(original.roads.nodes.size);
    const intersection = [...restored.roads.nodes.values()].find((n) => n.kind === 'intersection');
    expect(intersection).toBeTruthy();

    // vetores simples
    expect(restored.regions.regions[0].properties).toEqual({ governo: 'monarquia' });
    expect(restored.pois.pois[0].name).toBe('Capital');
    expect(restored.objects.objects[0].tags).toEqual(['marco']);
    expect(restored.objects.objects[0].z_offset_m).toBe(2);

    // biomas: paleta, seed e polígonos (fonte)
    expect(restored.biomes.scatterSeed).toBe(4242);
    expect(restored.biomes.polygons.length).toBe(1);
    expect(restored.biomes.polygons[0].featherRadius_m).toBe(24);
    expect(restored.biomes.palette).toEqual(original.biomes.palette);

    // metadados de camada (Outliner)
    expect(restored.roads.name).toBe('Vias do Reino');
    expect(restored.pois.visible).toBe(false);
    expect(restored.objects.locked).toBe(true);
  });

  it('mundo vazio: .wmap pequeno, sem tiles (esparso — D4)', async () => {
    const world = new WorldData(
      createWorldConfig({
        projectName: 'Vazio',
        extent: { width_m: 16000, height_m: 16000 },
        terrainResolution_m: 4,
        heightRange: RANGE,
      }),
    );
    const bytes = await saveWmap(world);
    expect(bytes.length).toBeLessThan(16_000); // ~0 bytes de raster
    const entries = await readZip(bytes);
    expect(entries.some((e) => e.path.startsWith('terrain/'))).toBe(false);
    const restored = await loadWmap(bytes);
    expect(restored.terrain.raster.allocatedTileCount).toBe(0);
    // mundo novo: oceano DESLIGADO — e continua desligado após o round-trip
    expect(restored.water.oceanEnabled).toBe(false);
  });

  it('compat: arquivo antigo sem oceanEnabled — mar mexido fica ligado', async () => {
    const world = makeRichWorld(); // seaLevel -5
    const bytes = await saveWmap(world);
    // simula um .wmap v1 antigo: remove o campo novo do layers.json
    const entries = await readZip(bytes);
    const patched = entries.map((entry) => {
      if (entry.path !== 'layers.json') return entry;
      const json = JSON.parse(new TextDecoder().decode(entry.data)) as {
        water: { oceanEnabled?: boolean };
      };
      delete json.water.oceanEnabled;
      return { path: entry.path, data: new TextEncoder().encode(JSON.stringify(json)) };
    });
    const restored = await loadWmap(await writeZipCompressed(patched));
    expect(restored.water.oceanEnabled).toBe(true); // seaLevel ≠ 0 ⇒ ligado
  });

  it('tiles do relevo saem comprimidos (deflate do zip — §8)', async () => {
    const world = makeRichWorld();
    const bytes = await saveWmap(world);
    // 2 tiles crus = 1 MB; com deflate o arquivo inteiro fica bem menor
    expect(bytes.length).toBeLessThan(300_000);
  });

  it('migrador rejeita versões mais novas e manifests inválidos', () => {
    expect(() => migrateManifest({ formatVersion: WMAP_FORMAT_VERSION + 1, config: {} })).toThrow(
      /versão mais nova/,
    );
    expect(() => migrateManifest({ oi: true })).toThrow(/inválido/);
  });
});

describe('zip com deflate + leitura (base do .wmap)', () => {
  it('round-trip com compressão e validação de CRC', async () => {
    const payload = new TextEncoder().encode('conteúdo repetido '.repeat(500));
    const zip = await writeZipCompressed([
      { path: 'a/dados.bin', data: payload },
      { path: 'thumb.png', data: new Uint8Array([1, 2, 3]) }, // .png fica stored
    ]);
    expect(zip.length).toBeLessThan(payload.length / 2); // deflate agiu

    const entries = await readZip(zip);
    expect(entries.length).toBe(2);
    expect(entries[0].path).toBe('a/dados.bin');
    expect(new TextDecoder().decode(entries[0].data)).toContain('conteúdo repetido');
    expect([...entries[1].data]).toEqual([1, 2, 3]);
  });

  it('detecta corrupção via CRC', async () => {
    const zip = await writeZipCompressed([
      { path: 'x.bin', data: new TextEncoder().encode('aaaa bbbb cccc dddd '.repeat(100)) },
    ]);
    zip[40] ^= 0xff; // corrompe um byte do payload
    // ou o inflate explode, ou o CRC pega — nunca passa silenciosamente
    await expect(readZip(zip)).rejects.toThrow();
  });
});
