import {
  TsRasterKernels,
  WorldData,
  createBiomePolygon,
  createWorldConfig,
  lineAsCubic,
  newId,
  planRoadPath,
  type PolygonRing,
} from '../core';

/**
 * Mapas de EXEMPLO do onboarding (README §11, item 33): construídos com o
 * core puro em milissegundos — nada de assets binários no repositório. O
 * usuário abre um mundo já vivo e desmonta para aprender.
 */

export interface ExampleWorld {
  id: string;
  name: string;
  description: string;
  build: () => WorldData;
}

const RANGE = { min_m: -200, max_m: 1800 };
const u16PerMeter = 65535 / (RANGE.max_m - RANGE.min_m);

const circle = (cx: number, cy: number, r: number, sides = 24): PolygonRing =>
  Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * 2 * Math.PI;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number];
  });

function baseWorld(projectName: string): { world: WorldData; kernels: TsRasterKernels } {
  const world = new WorldData(
    createWorldConfig({
      projectName,
      extent: { width_m: 8192, height_m: 8192 },
      terrainResolution_m: 4,
      heightRange: RANGE,
    }),
  );
  return { world, kernels: new TsRasterKernels() };
}

function buildVolcanicIsland(): WorldData {
  const { world, kernels } = baseWorld('Ilha Vulcânica');
  const raster = world.terrain.raster;
  const stamp = (
    cx_m: number,
    cy_m: number,
    r_m: number,
    meters: number,
    falloff = 'smooth' as const,
  ) =>
    kernels.applyRaise(
      raster,
      { cx_cells: cx_m / 4, cy_cells: cy_m / 4, radius_cells: r_m / 4, strength: 1, falloff },
      Math.round(meters * u16PerMeter),
    );

  // o cone da ilha, o cume e a cratera (raise negativo cava)
  stamp(4096, 4096, 2600, 420);
  stamp(4096, 4096, 1200, 380);
  stamp(4096, 4096, 260, -240, 'smooth');
  raster.consumeDirty();

  // mar a 5 m: a planície basal (0 m) vira oceano; a ilha emerge
  world.water.setSeaLevel(5);
  world.water.setOceanEnabled(true);
  // lago na cratera (cota acima do fundo cavado)
  world.water.addBody({
    id: newId(),
    kind: 'lake',
    surface_m: 520,
    polygon: circle(4096, 4096, 200),
    material: 'water_lake',
  });

  // biomas: floresta na encosta, rocha no cume
  world.biomes.scatterSeed = 20260716;
  world.biomes.addPolygon(createBiomePolygon(1, circle(4096, 4096, 1900), 60));
  world.biomes.addPolygon(createBiomePolygon(4, circle(4096, 4096, 700), 40));

  world.regions.add({
    id: newId(),
    name: 'A Ilha',
    description: 'Um vulcão adormecido no meio do oceano.',
    polygon: circle(4096, 4096, 2500, 32),
    color: '#b06ab0',
    properties: { clima: 'tropical' },
  });
  world.pois.add({
    id: newId(),
    name: 'O Cume',
    icon: '▲',
    pos: { x: 4096, y: 4096 },
    properties: {},
  });
  world.pois.add({
    id: newId(),
    name: 'Porto Leste',
    icon: '⚓',
    pos: { x: 6100, y: 4096 },
    properties: {},
  });
  return world;
}

function buildRiverValley(): WorldData {
  const { world, kernels } = baseWorld('Vale do Rio');
  const raster = world.terrain.raster;
  const ridge = (cx_m: number, meters: number) => {
    for (let y = 400; y <= 7800; y += 500) {
      kernels.applyRaise(
        raster,
        { cx_cells: cx_m / 4, cy_cells: y / 4, radius_cells: 320, strength: 1, falloff: 'smooth' },
        Math.round(meters * u16PerMeter),
      );
    }
  };
  ridge(1600, 300); // serra oeste
  ridge(6600, 360); // serra leste
  raster.consumeDirty();

  // o rio desce o vale (cota decrescente — §4.3) e deságua no mar
  world.water.setSeaLevel(0);
  world.water.setOceanEnabled(true);
  world.water.addRiver({
    id: newId(),
    nodes: [
      { x: 4100, y: 7600, width_m: 12, surface_m: 60 },
      { x: 3900, y: 5400, width_m: 16, surface_m: 40 },
      { x: 4300, y: 3200, width_m: 20, surface_m: 20 },
      { x: 4100, y: 800, width_m: 26, surface_m: 2 },
    ],
    carveDepth_m: 3,
  });

  // estrada cruzando o vale
  const line = lineAsCubic({ x: 900, y: 4200 }, { x: 7300, y: 4000 });
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
    { width_m: 8, type: 'dirt', material: 'road_dirt', carveTerrain: false, maxGrade_pct: 15 },
  );
  plan.nodesToAdd.forEach((n) => world.roads.addNode(n));
  plan.edgesToAdd.forEach((e) => world.roads.addEdge(e));

  // campo no fundo do vale, floresta nas encostas
  world.biomes.scatterSeed = 20260717;
  world.biomes.addPolygon(
    createBiomePolygon(
      2,
      [
        [2800, 600],
        [5400, 600],
        [5400, 7600],
        [2800, 7600],
      ],
      80,
    ),
  );
  world.biomes.addPolygon(createBiomePolygon(1, circle(1600, 4200, 900), 60));

  world.regions.add({
    id: newId(),
    name: 'O Vale',
    description: 'Terra fértil entre duas serras.',
    polygon: [
      [2400, 400],
      [5800, 400],
      [5800, 7800],
      [2400, 7800],
    ],
    color: '#5a8a5a',
    properties: {},
  });
  world.pois.add({
    id: newId(),
    name: 'Vila da Ponte',
    icon: '⌂',
    pos: { x: 4150, y: 4100 },
    properties: {},
  });
  return world;
}

export const EXAMPLE_WORLDS: ExampleWorld[] = [
  {
    id: 'ilha-vulcanica',
    name: 'Ilha Vulcânica',
    description: 'Vulcão com lago de cratera, floresta na encosta e oceano ao redor.',
    build: buildVolcanicIsland,
  },
  {
    id: 'vale-do-rio',
    name: 'Vale do Rio',
    description: 'Rio descendo entre duas serras, estrada, campo e floresta.',
    build: buildRiverValley,
  },
];
