import { BiomeRasterCache, scatterVegetationForTile, type WorldData } from '../../../core';
import { northSpan_m, positionToUE, yawToUE, type UEVector } from './unrealSpace';

/**
 * Objetos para a Unreal (README §9.1: "JSON/CSV: type, x, y, z, yaw, scale").
 *
 * - objetos MANUAIS: JSON com fidelidade total (escala por eixo, tags,
 *   alignToSlope) — são poucos e ricos;
 * - VEGETAÇÃO procedural: o .wmap guarda regra + seed (§4.7), mas a engine
 *   precisa de instâncias — o exportador MATERIALIZA o scatter aqui, com o
 *   mesmo código determinístico do render, em CSV compacto (podem ser
 *   milhões de linhas).
 *
 * z = altura do terreno no ponto (+ z_offset nos manuais); coordenadas já no
 * espaço da Unreal (uu, flip N-S, yaw invertido — ver unrealSpace.ts).
 */

export interface ManualObjectUE {
  type: string;
  position: UEVector;
  yaw_deg: number;
  scale: { x: number; y: number; z: number };
  alignToSlope: boolean;
  tags: string[];
}

export function exportManualObjects(world: WorldData): ManualObjectUE[] {
  const extentNS = northSpan_m(world);
  return world.objects.objects.map((object) => ({
    type: object.type,
    position: positionToUE(
      object.pos.x,
      object.pos.y,
      world.terrain.getHeight(object.pos.x, object.pos.y) + object.z_offset_m,
      extentNS,
    ),
    yaw_deg: yawToUE(object.rotation_deg),
    scale: { ...object.scale },
    alignToSlope: object.alignToSlope,
    tags: [...object.tags],
  }));
}

export const SCATTER_CSV_HEADER = 'type,x,y,z,yaw,scale';

/**
 * Materializa o scatter procedural em CSV (uu). Determinístico: mesmo mundo
 * ⇒ mesmos bytes. Devolve também a contagem para o manifest/avisos.
 */
export function exportScatterCsv(world: WorldData): { csv: string; count: number } {
  const grid = world.terrain.raster;
  const res = world.config.terrainResolution_m;
  const extentNS = northSpan_m(world);
  const cache = new BiomeRasterCache(grid.widthCells, grid.heightCells, res);
  cache.sync(world.biomes);
  const raster = cache.biomeRaster;

  const lines: string[] = [SCATTER_CSV_HEADER];
  let count = 0;
  const tiles = [...raster.allocatedTiles()]
    .map(([key]) => key.split(',').map(Number) as [number, number])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]); // ordem estável ⇒ determinismo

  for (const [tx, ty] of tiles) {
    for (const item of scatterVegetationForTile(world.terrain, world.biomes, raster, res, tx, ty)) {
      const p = positionToUE(item.x, item.y, world.terrain.getHeight(item.x, item.y), extentNS);
      lines.push(
        `${item.type},${round2(p.x)},${round2(p.y)},${round2(p.z)},` +
          `${round2(yawToUE(item.rotation_deg))},${round3(item.scale)}`,
      );
      count++;
    }
  }
  return { csv: lines.join('\n') + '\n', count };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
