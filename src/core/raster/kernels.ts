import type { TiledRaster } from './TiledRaster';

/**
 * Kernels de raster atrás de uma interface (README §10.1): começa 100%
 * TypeScript (kernelsTs.ts) e troca por Rust→WASM quando o profiler mandar.
 * Se a fronteira estiver limpa, é uma troca de implementação.
 *
 * Kernels trabalham em CÉLULAS e valores u16 — conversões de metros são
 * responsabilidade de quem chama (a ferramenta).
 */

/** Falloffs do pincel (README §7.1). */
export type FalloffKind = 'linear' | 'smooth' | 'sharp' | 'constant';

/** Um "carimbo" circular do pincel, em coordenadas de célula. */
export interface BrushStamp {
  cx_cells: number;
  cy_cells: number;
  radius_cells: number;
  /** [0..1] */
  strength: number;
  falloff: FalloffKind;
}

export interface RasterKernels {
  /** Raise/Lower: soma ±amount × falloff × strength (README §7.1). */
  applyRaise(raster: TiledRaster<Uint16Array>, stamp: BrushStamp, amount_u16: number): void;

  /** Smooth: puxa cada célula para a média 3×3 das vizinhas. */
  applySmooth(raster: TiledRaster<Uint16Array>, stamp: BrushStamp): void;

  /** Flatten: puxa para a altura do primeiro clique (target). */
  applyFlatten(raster: TiledRaster<Uint16Array>, stamp: BrushStamp, target_u16: number): void;

  /**
   * Carve: como flatten, mas só REBAIXA (nunca sobe) — usado para cavar
   * leito de rio/estrada sem aterrar vales que já estejam abaixo do alvo.
   */
  applyCarve(raster: TiledRaster<Uint16Array>, stamp: BrushStamp, target_u16: number): void;
}

/** Peso do falloff para t = dist/raio ∈ [0..1]. */
export function falloffWeight(kind: FalloffKind, t: number): number {
  const u = Math.min(1, Math.max(0, t));
  switch (kind) {
    case 'constant':
      return 1;
    case 'linear':
      return 1 - u;
    case 'smooth':
      return 1 - u * u * (3 - 2 * u); // 1 − smoothstep
    case 'sharp':
      return (1 - u) * (1 - u);
  }
}

/** Bounding box de células afetadas pelo stamp, clampado ao grid. Null = fora do mapa. */
export function stampCellBounds(
  raster: TiledRaster<Uint16Array>,
  stamp: BrushStamp,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const x0 = Math.max(0, Math.floor(stamp.cx_cells - stamp.radius_cells));
  const y0 = Math.max(0, Math.floor(stamp.cy_cells - stamp.radius_cells));
  const x1 = Math.min(raster.widthCells - 1, Math.ceil(stamp.cx_cells + stamp.radius_cells));
  const y1 = Math.min(raster.heightCells - 1, Math.ceil(stamp.cy_cells + stamp.radius_cells));
  if (x0 > x1 || y0 > y1) return null;
  return { x0, y0, x1, y1 };
}
