import type { BiomeLayer } from '../layers/BiomeLayer';
import type { TerrainLayer } from '../layers/TerrainLayer';
import type { TiledRaster } from '../raster/TiledRaster';

/**
 * Scatter procedural DETERMINÍSTICO por regra de bioma (README §4.7):
 * não armazene instância nenhuma — armazene a regra + seed. Milhões de
 * árvores viram ~200 bytes. Mesmo seed + mesmo tile ⇒ mesmas instâncias,
 * no render e no exportador.
 */

export interface VegetationInstance {
  type: string;
  x: number;
  y: number;
  rotation_deg: number;
  scale: number;
}

/** mulberry32: PRNG rápido e determinístico. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tileSeed(seed: number, tx: number, ty: number, ruleIndex: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (tx + 0x9e3779b9), 0x85ebca6b);
  h = Math.imul(h ^ (ty + 0x9e3779b9), 0xc2b2ae35);
  h = Math.imul(h ^ (ruleIndex + 0x27d4eb2f), 0x165667b1);
  return h >>> 0;
}

/** Declividade do terreno em graus na posição (gradiente central). */
export function slopeAtDeg(terrain: TerrainLayer, x_m: number, y_m: number, res: number): number {
  const hL = terrain.getHeight(x_m - res, y_m);
  const hR = terrain.getHeight(x_m + res, y_m);
  const hD = terrain.getHeight(x_m, y_m - res);
  const hU = terrain.getHeight(x_m, y_m + res);
  const gx = (hR - hL) / (2 * res);
  const gy = (hU - hD) / (2 * res);
  return (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
}

/**
 * Gera as instâncias de vegetação de UM tile do raster de biomas.
 * Determinístico em (scatterSeed, tx, ty, regra) — os candidatos cobrem o
 * tile inteiro e são rejeitados fora do bioma da regra, acima da declividade
 * máxima ou debaixo d'água (cota abaixo do nível do mar fica sem vegetação
 * visível de qualquer forma; a checagem fica com o consumidor se precisar).
 */
export function scatterVegetationForTile(
  terrain: TerrainLayer,
  biomes: BiomeLayer,
  biomeRaster: TiledRaster<Uint8Array>,
  resolution_m: number,
  tx: number,
  ty: number,
): VegetationInstance[] {
  const T = biomeRaster.tileSize;
  const x0_cells = tx * T;
  const y0_cells = ty * T;
  const width_cells = Math.min(T, biomeRaster.widthCells - x0_cells);
  const height_cells = Math.min(T, biomeRaster.heightCells - y0_cells);
  if (width_cells <= 0 || height_cells <= 0) return [];

  const tileArea_ha = (width_cells * resolution_m * (height_cells * resolution_m)) / 10_000;
  const instances: VegetationInstance[] = [];

  for (const biome of biomes.palette) {
    biome.vegetationRules.forEach((rule, ruleIndex) => {
      const candidates = Math.round(rule.density_per_ha * tileArea_ha);
      if (candidates <= 0) return;
      const random = mulberry32(tileSeed(biomes.scatterSeed, tx, ty, biome.id * 31 + ruleIndex));

      for (let i = 0; i < candidates; i++) {
        const cx = x0_cells + random() * width_cells;
        const cy = y0_cells + random() * height_cells;
        const rotation = random() * 360;
        const scaleT = random();
        // rejeição: só nasce dentro do bioma da regra
        if (biomeRaster.get(Math.floor(cx), Math.floor(cy)) !== biome.id) continue;
        const x = cx * resolution_m;
        const y = cy * resolution_m;
        if (slopeAtDeg(terrain, x, y, resolution_m) > rule.slopeMax_deg) continue;
        instances.push({
          type: rule.objectType,
          x,
          y,
          rotation_deg: rotation,
          scale: rule.scaleRange[0] + (rule.scaleRange[1] - rule.scaleRange[0]) * scaleT,
        });
      }
    });
  }
  return instances;
}
