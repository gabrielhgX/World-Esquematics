import {
  BiomeRasterCache,
  distanceToMask,
  type BiomeDefinition,
  type WorldData,
} from '../../../core';

/**
 * Weightmaps de bioma para o Landscape (README §9.1: "1 PNG 8-bit por
 * bioma"). O raster de ids (cache dos polígonos, §4.4) vira um peso 0..255
 * por bioma, com a transição suave do `featherRadius_m` aplicada AQUI — o
 * feather é coisa da exportação, o dado continua sendo o polígono.
 *
 * - a rampa cruza a fronteira do bioma: peso 0.5 na borda, largura total da
 *   transição = featherRadius_m (metade para cada lado);
 * - o feather é por polígono no dado; no raster só sobrevive o id vencedor,
 *   então usamos o MAIOR feather entre os polígonos do bioma (aproximação);
 * - onde biomas vizinhos se cruzam, a soma dos pesos é limitada a 1
 *   (crossfade); a sobra perto de "sem bioma" fica para a camada base;
 * - saída já na resolução do Landscape e com linha 0 = NORTE (gotcha #3).
 */

export interface BiomeWeightmap {
  biome: BiomeDefinition;
  /** dstW×dstH, um byte por vértice, linha 0 = norte */
  pixels: Uint8Array;
}

export function computeBiomeWeightmaps(
  world: WorldData,
  dstW: number,
  dstH: number,
): BiomeWeightmap[] {
  if (world.biomes.polygons.length === 0) return [];
  const grid = world.terrain.raster;
  const res = world.config.terrainResolution_m;
  const w = grid.widthCells;
  const h = grid.heightCells;

  const cache = new BiomeRasterCache(w, h, res);
  cache.sync(world.biomes);
  const ids = cache.biomeRaster.toDense((n) => new Uint8Array(n));

  // pesos por bioma na resolução do terreno (u8 para segurar a memória)
  const weights: Array<{ biome: BiomeDefinition; data: Uint8Array }> = [];
  const mask = new Uint8Array(w * h);
  for (const biome of world.biomes.palette) {
    const feather_m = Math.max(
      0,
      ...world.biomes.polygons.filter((p) => p.biomeId === biome.id).map((p) => p.featherRadius_m),
    );
    let present = false;
    for (let i = 0; i < ids.length; i++) {
      const inside = ids[i] === biome.id;
      mask[i] = inside ? 1 : 0;
      present ||= inside;
    }
    if (!present) continue;

    const data = new Uint8Array(w * h);
    if (feather_m < res) {
      for (let i = 0; i < ids.length; i++) data[i] = mask[i] ? 255 : 0;
    } else {
      const dOut = distanceToMask(mask, w, h); // p/ células de fora
      for (let i = 0; i < mask.length; i++) mask[i] = mask[i] ? 0 : 1;
      const dIn = distanceToMask(mask, w, h); // p/ células de dentro
      for (let i = 0; i < data.length; i++) {
        const sd_m = (mask[i] ? -(dOut[i] - 0.5) : dIn[i] - 0.5) * res;
        const weight = Math.min(1, Math.max(0, 0.5 + sd_m / feather_m));
        data[i] = Math.round(weight * 255);
      }
    }
    weights.push({ biome, data });
  }

  // crossfade: soma dos pesos limitada a 255 por célula
  const sum = new Uint32Array(w * h);
  for (const { data } of weights) for (let i = 0; i < sum.length; i++) sum[i] += data[i];
  for (const { data } of weights) {
    for (let i = 0; i < data.length; i++) {
      if (sum[i] > 255) data[i] = Math.round((data[i] * 255) / sum[i]);
    }
  }

  // resolução do Landscape + flip vertical (linha 0 = norte)
  return weights.map(({ biome, data }) => ({
    biome,
    pixels: resampleFlippedU8(data, w, h, dstW, dstH),
  }));
}

/** Bilinear (cantos preservados, como o bicúbico do heightmap) + flip N-S. */
function resampleFlippedU8(
  src: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8Array {
  const out = new Uint8Array(dstW * dstH);
  const scaleX = dstW > 1 ? (srcW - 1) / (dstW - 1) : 0;
  const scaleY = dstH > 1 ? (srcH - 1) / (dstH - 1) : 0;
  for (let j = 0; j < dstH; j++) {
    const sy = (dstH - 1 - j) * scaleY; // flip: linha 0 da saída = norte
    const y0 = Math.min(srcH - 1, Math.floor(sy));
    const y1 = Math.min(srcH - 1, y0 + 1);
    const ty = sy - y0;
    for (let i = 0; i < dstW; i++) {
      const sx = i * scaleX;
      const x0 = Math.min(srcW - 1, Math.floor(sx));
      const x1 = Math.min(srcW - 1, x0 + 1);
      const tx = sx - x0;
      const top = src[y0 * srcW + x0] * (1 - tx) + src[y0 * srcW + x1] * tx;
      const bottom = src[y1 * srcW + x0] * (1 - tx) + src[y1 * srcW + x1] * tx;
      out[j * dstW + i] = Math.round(top * (1 - ty) + bottom * ty);
    }
  }
  return out;
}
