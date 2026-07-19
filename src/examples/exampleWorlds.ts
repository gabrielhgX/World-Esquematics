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

function buildErodedBasin(): WorldData {
  const { world, kernels } = baseWorld('Serras Erodidas');
  const raster = world.terrain.raster;
  const stamp = (cx_m: number, cy_m: number, r_m: number, meters: number) =>
    kernels.applyRaise(
      raster,
      { cx_cells: cx_m / 4, cy_cells: cy_m / 4, radius_cells: r_m / 4, strength: 1, falloff: 'smooth' },
      Math.round(meters * u16PerMeter),
    );

  // LCG determinístico: o mapa é o mesmo toda vez (README §11 exige isso)
  let seed = 20260719;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  // planalto largo positivo + rugosidade irregular no anel médio: os vales
  // entre os morros viram talvegues, e tudo escoa para a bacia central —
  // a rede de drenagem que a lente de Hidrografia existe para mostrar.
  stamp(4096, 4096, 4200, 260);
  for (let i = 0; i < 60; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 900 + rand() * 2600;
    stamp(
      4096 + Math.cos(angle) * radius,
      4096 + Math.sin(angle) * radius,
      250 + rand() * 500,
      30 + rand() * 110,
    );
  }
  stamp(4096, 4096, 1500, -340); // bacia central: o sumidouro interno
  raster.consumeDirty();

  // lago no fundo da bacia (o dreno para onde a rede converge)
  const basin_m = world.terrain.getHeight(4096, 4096);
  world.water.addBody({
    id: newId(),
    kind: 'lake',
    surface_m: Math.round(basin_m + 45),
    polygon: circle(4096, 4096, 900),
    material: 'water_lake',
  });

  // floresta nas serras, rocha nos cumes
  world.biomes.scatterSeed = 20260719;
  world.biomes.addPolygon(createBiomePolygon(1, circle(4096, 4096, 3400, 32), 70));
  world.biomes.addPolygon(createBiomePolygon(4, circle(4096, 4096, 1300), 40));

  world.regions.add({
    id: newId(),
    name: 'As Serras',
    description: 'Planalto erodido drenando para a bacia central.',
    polygon: circle(4096, 4096, 3800, 32),
    color: '#6a8ab0',
    properties: { clima: 'temperado' },
  });
  world.pois.add({
    id: newId(),
    name: 'Lago da Bacia',
    icon: '≈',
    pos: { x: 4096, y: 4096 },
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
  {
    id: 'serras-erodidas',
    name: 'Serras Erodidas',
    description: 'Planalto rugoso drenando para uma bacia central — abra a lente Hidrografia.',
    build: buildErodedBasin,
  },
];
