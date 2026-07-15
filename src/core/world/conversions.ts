/**
 * Conversões metro ↔ célula ↔ uint16 (README §1.2).
 * Funções puras — nenhuma dependência de UI, DOM ou engine (README §2).
 */
import type { HeightRange } from './WorldConfig';

export const U16_MAX = 65535;

/** mundo (m) → índice de célula do heightmap. */
export function worldToCell(coord_m: number, terrainResolution_m: number): number {
  return Math.floor(coord_m / terrainResolution_m);
}

/** célula → mundo (m), no CANTO da célula (README §1.2). */
export function cellToWorld(cell: number, terrainResolution_m: number): number {
  return cell * terrainResolution_m;
}

/** altura (m) → uint16, com clamp dentro do heightRange. */
export function heightToU16(h_m: number, range: HeightRange): number {
  const t = (h_m - range.min_m) / (range.max_m - range.min_m);
  return Math.round(Math.min(1, Math.max(0, t)) * U16_MAX);
}

/** uint16 → altura (m). */
export function u16ToHeight(h16: number, range: HeightRange): number {
  return range.min_m + (h16 / U16_MAX) * (range.max_m - range.min_m);
}

/** Precisão vertical do formato: (max − min) / 65535 (README §1). */
export function verticalPrecision_m(range: HeightRange): number {
  return (range.max_m - range.min_m) / U16_MAX;
}

/**
 * Amostragem em posição arbitrária: BILINEAR entre as 4 células vizinhas
 * (README §1.2). Nunca nearest — causa objetos "pulando" ao mover.
 *
 * `sample` recebe índices de célula e devolve o valor armazenado; o chamador
 * decide o comportamento de borda (ex.: `TiledRaster.get` faz clamp).
 */
export function sampleBilinear(
  sample: (cx: number, cy: number) => number,
  x_m: number,
  y_m: number,
  terrainResolution_m: number,
): number {
  const gx = x_m / terrainResolution_m;
  const gy = y_m / terrainResolution_m;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = gx - x0;
  const ty = gy - y0;

  const v00 = sample(x0, y0);
  const v10 = sample(x0 + 1, y0);
  const v01 = sample(x0, y0 + 1);
  const v11 = sample(x0 + 1, y0 + 1);

  const top = v00 + (v10 - v00) * tx;
  const bottom = v01 + (v11 - v01) * tx;
  return top + (bottom - top) * ty;
}
