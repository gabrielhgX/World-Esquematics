import type { PolygonRing } from './polygon';
import type { RasterArray, TiledRaster } from '../raster/TiledRaster';

/**
 * Rasterização de polígono por scanline par-ímpar, compartilhada pelos
 * caches derivados (superfície d'água, raster de biomas — README §4.3/§4.4).
 * Preenche células cujo ponto de amostragem (canto, convenção do §1.2) cai
 * dentro do anel.
 */
export function rasterizePolygon<T extends RasterArray>(
  raster: TiledRaster<T>,
  polygon: PolygonRing,
  value: number,
  resolution_m: number,
): void {
  if (polygon.length < 3) return;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of polygon) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const cy0 = Math.max(0, Math.ceil(minY / resolution_m));
  const cy1 = Math.min(raster.heightCells - 1, Math.floor(maxY / resolution_m));

  const xs: number[] = [];
  for (let cy = cy0; cy <= cy1; cy++) {
    const y = cy * resolution_m;
    xs.length = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      // regra semiaberta (yi ≤ y < yj ou yj ≤ y < yi) evita contar vértices 2×
      if (yi <= y === yj <= y) continue;
      xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const cx0 = Math.max(0, Math.ceil(xs[k] / resolution_m));
      // fim semiaberto: canto exatamente sobre a borda direita fica FORA —
      // instâncias contínuas geradas dentro da célula não vazam do polígono
      const cx1 = Math.min(raster.widthCells - 1, Math.ceil(xs[k + 1] / resolution_m) - 1);
      for (let cx = cx0; cx <= cx1; cx++) {
        raster.set(cx, cy, value);
      }
    }
  }
}
