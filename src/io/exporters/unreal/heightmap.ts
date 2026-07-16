import { deriveGrid, resampleBicubicU16, type WorldData } from '../../../core';
import { nearestLandscapeSize } from './landscapeSizes';

/**
 * Heightmap do Landscape — os três gotchas do README §9.1:
 *
 * #1 resolução travada: reamostra (bicúbico) para o tamanho válido mais
 *    próximo da tabela do Landscape.
 * #2 escala Z: com ZScale = 100 o uint16 mapeia para ±256 m (512 m totais).
 *    Para um heightRange de S metros:
 *      ZScale    = S / 512 × 100
 *      LocationZ = min_m + 256 × (ZScale / 100)   [m → ×100 em uu]
 *    Verificação: h16=0 → min_m; h16=65535 → max_m.
 * #3 eixos: canônico é Z-up DESTRO (D10); Unreal é Z-up CANHOTA. O heightmap
 *    sai com flip vertical — LINHA 0 = NORTE (a linha 0 do raster é o sul).
 *    Validado pelo teste do mapa "L" assimétrico.
 */

export interface LandscapePlan {
  /** uint16 little-endian, linhas norte→sul, colunas oeste→leste */
  r16: Uint8Array;
  resolutionX: number;
  resolutionY: number;
  /** escalas do Landscape (100 = 1 m/quad; Z conforme gotcha #2) */
  scale: { x: number; y: number; z: number };
  /** posição do ator Landscape em uu */
  location: { x: number; y: number; z: number };
  resampled: boolean;
}

export function buildLandscapePlan(world: WorldData): LandscapePlan {
  const { config } = world;
  const raster = world.terrain.raster;
  const grid = deriveGrid(config);
  const dstW = nearestLandscapeSize(grid.widthCells);
  const dstH = nearestLandscapeSize(grid.heightCells);

  const dense = raster.toDense((n) => new Uint16Array(n));
  const resampled =
    dstW === raster.widthCells && dstH === raster.heightCells
      ? dense
      : resampleBicubicU16(dense, raster.widthCells, raster.heightCells, dstW, dstH);

  // flip vertical: linha 0 da imagem = NORTE (gotcha #3)
  const r16 = new Uint8Array(dstW * dstH * 2);
  const view = new DataView(r16.buffer);
  for (let row = 0; row < dstH; row++) {
    const sourceRow = dstH - 1 - row;
    for (let col = 0; col < dstW; col++) {
      view.setUint16((row * dstW + col) * 2, resampled[sourceRow * dstW + col], true);
    }
  }

  const span_m = config.heightRange.max_m - config.heightRange.min_m;
  const zScale = (span_m / 512) * 100;
  const locationZ_m = config.heightRange.min_m + 256 * (zScale / 100);

  return {
    r16,
    resolutionX: dstW,
    resolutionY: dstH,
    scale: {
      x: (config.extent.width_m / (dstW - 1)) * 100,
      y: (config.extent.height_m / (dstH - 1)) * 100,
      z: zScale,
    },
    location: { x: 0, y: 0, z: locationZ_m * 100 },
    resampled: resampled !== dense,
  };
}
