import {
  SculptCommand,
  flattenCubic,
  heightToU16,
  stampCellBounds,
  type BrushStamp,
  type RasterKernels,
  type TileKey,
  type WorldData,
} from '../core';

/**
 * "Aplicar estrada ao relevo" (README §4.5): comando EXPLÍCITO, nunca
 * automático — automático = o usuário perde controle e o undo vira pesadelo.
 *
 * O leito é aplainado (corte E aterro) para o PERFIL SUAVIZADO da via:
 * média móvel das alturas do terreno ao longo da spline, o que já reduz
 * a inclinação efetiva da pista. Pontes ignoram o relevo (§4.5).
 */
export function buildRoadsCarveCommand(
  world: WorldData,
  kernels: RasterKernels,
): SculptCommand | null {
  const roads = world.roads;
  const res = world.config.terrainResolution_m;
  const range = world.config.heightRange;
  const raster = world.terrain.raster;

  const stamps: Array<{ stamp: BrushStamp; target_u16: number }> = [];
  const tiles = new Set<TileKey>();

  for (const edge of roads.edges.values()) {
    if (!edge.carveTerrain || edge.type === 'bridge') continue;
    const from = roads.getNode(edge.from);
    const to = roads.getNode(edge.to);
    if (!from || !to) continue;

    // amostra a spline (flatten por tolerância) e reamostra em passos fixos
    const { points } = flattenCubic({ p0: from.pos, c1: edge.c1, c2: edge.c2, p1: to.pos }, 0.5);
    const step = Math.max(res, edge.width_m / 2);
    const samples: Array<{ x: number; y: number }> = [points[0]];
    let carry = 0;
    for (let i = 1; i < points.length; i++) {
      let a = points[i - 1];
      const b = points[i];
      let dist = Math.hypot(b.x - a.x, b.y - a.y);
      while (carry + dist >= step) {
        const t = (step - carry) / dist;
        const pt = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        samples.push(pt);
        a = pt;
        dist = Math.hypot(b.x - a.x, b.y - a.y);
        carry = 0;
      }
      carry += dist;
    }

    // perfil da pista: alturas suavizadas por média móvel
    const heights = samples.map((pt) => world.terrain.getHeight(pt.x, pt.y));
    const window = 5;
    const profile = heights.map((_, i) => {
      let sum = 0;
      let count = 0;
      for (let k = -window; k <= window; k++) {
        const index = i + k;
        if (index < 0 || index >= heights.length) continue;
        sum += heights[index];
        count++;
      }
      return sum / count;
    });

    samples.forEach((pt, i) => {
      const stamp: BrushStamp = {
        cx_cells: pt.x / res,
        cy_cells: pt.y / res,
        radius_cells: Math.max(1, edge.width_m / 2 / res),
        strength: 1,
        falloff: 'smooth',
      };
      const bounds = stampCellBounds(raster, stamp);
      if (!bounds) return;
      for (const key of raster.tilesInCellRect(bounds.x0, bounds.y0, bounds.x1, bounds.y1)) {
        tiles.add(key);
      }
      stamps.push({ stamp, target_u16: heightToU16(profile[i], range) });
    });
  }

  if (stamps.length === 0) return null;
  return new SculptCommand(
    'Aplicar estradas ao relevo',
    (r) => {
      for (const { stamp, target_u16 } of stamps) {
        kernels.applyFlatten(r, stamp, target_u16);
      }
    },
    [...tiles],
  );
}
