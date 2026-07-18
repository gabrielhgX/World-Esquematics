import type { WorldData } from '../../../core';
import { northSpan_m, positionToUE, type UEVector } from './unrealSpace';

/**
 * Vetores para a Unreal (README §9.1):
 * - estradas → JSON de splines (o importador cria Landscape Splines);
 * - água → JSON de polígonos + cotas (Water Body Custom);
 * - regiões/POIs → JSON de metadados.
 *
 * Tudo já no espaço da Unreal (uu, flip N-S — ver unrealSpace.ts). O z das
 * splines de estrada é a altura do terreno em cada ponto de controle: depois
 * do carve, a estrada assenta no relevo.
 */

export interface RoadSplineUE {
  id: string;
  fromNode: string;
  toNode: string;
  /** Bézier cúbica: p0, c1, c2, p1 */
  points: [UEVector, UEVector, UEVector, UEVector];
  width_uu: number;
  type: string;
  material: string;
  carveTerrain: boolean;
}

export function exportRoadSplines(world: WorldData) {
  const extentNS = northSpan_m(world);
  const at = (x: number, y: number) => positionToUE(x, y, world.terrain.getHeight(x, y), extentNS);

  const nodes = [...world.roads.nodes.values()].map((node) => ({
    id: node.id,
    kind: node.kind,
    position: at(node.pos.x, node.pos.y),
  }));
  const splines: RoadSplineUE[] = [...world.roads.edges.values()].map((edge) => {
    const from = world.roads.nodes.get(edge.from);
    const to = world.roads.nodes.get(edge.to);
    if (!from || !to) throw new Error(`Aresta ${edge.id} com nó ausente — grafo inconsistente.`);
    return {
      id: edge.id,
      fromNode: edge.from,
      toNode: edge.to,
      points: [
        at(from.pos.x, from.pos.y),
        at(edge.c1.x, edge.c1.y),
        at(edge.c2.x, edge.c2.y),
        at(to.pos.x, to.pos.y),
      ],
      width_uu: edge.width_m * 100,
      type: edge.type,
      material: edge.material,
      carveTerrain: edge.carveTerrain,
    };
  });
  return { nodes, splines };
}

export function exportWater(world: WorldData) {
  const extentNS = northSpan_m(world);
  const ring = (polygon: ReadonlyArray<readonly [number, number]>, z_m: number) =>
    polygon.map(([x, y]) => positionToUE(x, y, z_m, extentNS));

  return {
    ocean: {
      enabled: world.water.oceanEnabled,
      surfaceZ_uu: world.water.seaLevel_m * 100,
      material: world.water.ocean.material,
    },
    lakes: world.water.lakes.map((lake) => ({
      id: lake.id,
      surfaceZ_uu: lake.surface_m * 100,
      material: lake.material,
      polygon: ring(lake.polygon, lake.surface_m),
    })),
    rivers: world.water.rivers.map((river) => ({
      id: river.id,
      carveDepth_uu: river.carveDepth_m * 100,
      // a ordem dos nós É a direção do fluxo (README §4.3)
      nodes: river.nodes.map((node) => ({
        position: positionToUE(node.x, node.y, node.surface_m, extentNS),
        width_uu: node.width_m * 100,
      })),
    })),
  };
}

export function exportMetadata(world: WorldData) {
  const extentNS = northSpan_m(world);
  return {
    regions: world.regions.regions.map((region) => ({
      id: region.id,
      name: region.name,
      description: region.description,
      color: region.color,
      properties: region.properties,
      polygon: region.polygon.map(([x, y]) => positionToUE(x, y, 0, extentNS)),
    })),
    pois: world.pois.pois.map((poi) => ({
      id: poi.id,
      name: poi.name,
      icon: poi.icon,
      properties: poi.properties,
      position: positionToUE(
        poi.pos.x,
        poi.pos.y,
        world.terrain.getHeight(poi.pos.x, poi.pos.y),
        extentNS,
      ),
    })),
  };
}
