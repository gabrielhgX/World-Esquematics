import type { TiledRaster } from './TiledRaster';
import type { BrushStamp, RasterKernels } from './kernels';
import { falloffWeight, stampCellBounds } from './kernels';

const U16_MAX = 65535;

function clampU16(v: number): number {
  return Math.min(U16_MAX, Math.max(0, Math.round(v)));
}

/**
 * Implementação 100% TypeScript dos kernels (README §10.1).
 * Será substituída por Rust→WASM atrás da mesma interface quando o profiler
 * apontar gargalo — nunca antes.
 */
export class TsRasterKernels implements RasterKernels {
  applyRaise(raster: TiledRaster<Uint16Array>, stamp: BrushStamp, amount_u16: number): void {
    this.forEachCellInStamp(raster, stamp, (x, y, weight) => {
      raster.set(x, y, clampU16(raster.get(x, y) + amount_u16 * weight));
    });
  }

  applySmooth(raster: TiledRaster<Uint16Array>, stamp: BrushStamp): void {
    const bounds = stampCellBounds(raster, stamp);
    if (!bounds) return;

    // Lê a região (com margem de 1 célula) ANTES de escrever — suavizar
    // in-place tornaria o resultado dependente da ordem de varredura.
    const sx = bounds.x0 - 1;
    const sy = bounds.y0 - 1;
    const sw = bounds.x1 - bounds.x0 + 3;
    const sh = bounds.y1 - bounds.y0 + 3;
    const snapshot = new Float64Array(sw * sh);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        snapshot[y * sw + x] = raster.get(sx + x, sy + y); // get clampa a borda
      }
    }

    this.forEachCellInStamp(raster, stamp, (x, y, weight) => {
      const lx = x - sx;
      const ly = y - sy;
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          sum += snapshot[(ly + dy) * sw + (lx + dx)];
        }
      }
      const average = sum / 9;
      const current = snapshot[ly * sw + lx];
      raster.set(x, y, clampU16(current + (average - current) * weight));
    });
  }

  applyFlatten(raster: TiledRaster<Uint16Array>, stamp: BrushStamp, target_u16: number): void {
    this.forEachCellInStamp(raster, stamp, (x, y, weight) => {
      const current = raster.get(x, y);
      raster.set(x, y, clampU16(current + (target_u16 - current) * weight));
    });
  }

  applyCarve(raster: TiledRaster<Uint16Array>, stamp: BrushStamp, target_u16: number): void {
    this.forEachCellInStamp(raster, stamp, (x, y, weight) => {
      const current = raster.get(x, y);
      if (current <= target_u16) return; // só rebaixa, nunca aterra
      raster.set(x, y, clampU16(current + (target_u16 - current) * weight));
    });
  }

  /** Varre as células dentro do círculo do stamp com weight = falloff × strength. */
  private forEachCellInStamp(
    raster: TiledRaster<Uint16Array>,
    stamp: BrushStamp,
    visit: (x: number, y: number, weight: number) => void,
  ): void {
    const bounds = stampCellBounds(raster, stamp);
    if (!bounds || stamp.radius_cells <= 0) return;
    const r2 = stamp.radius_cells * stamp.radius_cells;
    for (let y = bounds.y0; y <= bounds.y1; y++) {
      const dy = y - stamp.cy_cells;
      for (let x = bounds.x0; x <= bounds.x1; x++) {
        const dx = x - stamp.cx_cells;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const t = Math.sqrt(d2) / stamp.radius_cells;
        const weight = falloffWeight(stamp.falloff, t) * stamp.strength;
        if (weight <= 0) continue;
        visit(x, y, weight);
      }
    }
  }
}
