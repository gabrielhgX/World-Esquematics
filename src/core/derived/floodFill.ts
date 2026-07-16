import type { TerrainLayer } from '../layers/TerrainLayer';
import { simplifyPolyline, type PolygonRing } from '../geometry/polygon';
import { worldToCell } from '../world/conversions';

/**
 * "Preencher lago" (README §4.3/§7.2): clique + cota → flood → WaterBody com
 * o polígono da borda. Comando explícito, não simulação contínua.
 *
 * O preenchimento cresce (4-conectado) a partir do clique sobre células com
 * terreno ABAIXO da cota — exatamente onde a água daquela cota chegaria.
 */

export interface LakeFillResult {
  polygon: PolygonRing;
  cellCount: number;
}

export interface LakeFillOptions {
  /** aborta lagos absurdamente grandes (padrão: sem limite) */
  maxCells?: number;
}

export function floodFillLake(
  terrain: TerrainLayer,
  resolution_m: number,
  seed: { x: number; y: number },
  surface_m: number,
  options: LakeFillOptions = {},
): LakeFillResult | null {
  const raster = terrain.raster;
  const W = raster.widthCells;
  const H = raster.heightCells;
  const maxCells = options.maxCells ?? Infinity;

  const sx = worldToCell(seed.x, resolution_m);
  const sy = worldToCell(seed.y, resolution_m);
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return null;
  if (terrain.getHeightAtCell(sx, sy) >= surface_m) return null; // clique em terra seca

  // BFS 4-conectado sobre células submersas na cota dada.
  const mask = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  let head = 0;
  let tail = 0;
  queue[tail++] = sy * W + sx;
  mask[sy * W + sx] = 1;
  let cellCount = 0;

  while (head < tail) {
    const index = queue[head++];
    cellCount++;
    if (cellCount > maxCells) return null;
    const cx = index % W;
    const cy = (index / W) | 0;
    // vizinhos 4-conectados
    if (cx > 0) tryVisit(index - 1, cx - 1, cy);
    if (cx < W - 1) tryVisit(index + 1, cx + 1, cy);
    if (cy > 0) tryVisit(index - W, cx, cy - 1);
    if (cy < H - 1) tryVisit(index + W, cx, cy + 1);
  }

  function tryVisit(index: number, cx: number, cy: number): void {
    if (mask[index]) return;
    if (terrain.getHeightAtCell(cx, cy) >= surface_m) return;
    mask[index] = 1;
    queue[tail++] = index;
  }

  const boundary = traceBoundary(mask, W, H);
  const points: Array<[number, number]> = boundary.map(([cx, cy]) => [
    cx * resolution_m,
    cy * resolution_m,
  ]);
  const polygon = simplifyPolyline(points, 1.5 * resolution_m);
  return { polygon, cellCount };
}

/**
 * Moore boundary tracing: devolve as células da borda externa da região,
 * em ordem (sentido de varredura), começando na mais ao sul-oeste.
 */
function traceBoundary(mask: Uint8Array, W: number, H: number): Array<[number, number]> {
  const filled = (cx: number, cy: number): boolean =>
    cx >= 0 && cy >= 0 && cx < W && cy < H && mask[cy * W + cx] === 1;

  // ponto de partida: primeira célula preenchida varrendo linhas
  let startX = -1;
  let startY = -1;
  outer: for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      if (mask[cy * W + cx]) {
        startX = cx;
        startY = cy;
        break outer;
      }
    }
  }
  if (startX === -1) return [];

  // vizinhança de Moore em sentido horário, começando a oeste
  const OFFSETS: Array<[number, number]> = [
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
  ];

  const boundary: Array<[number, number]> = [[startX, startY]];
  let cx = startX;
  let cy = startY;
  let backtrack = 0; // índice do vizinho por onde "chegamos" (oeste no início)
  const maxSteps = 4 * (W * H + 1);

  for (let step = 0; step < maxSteps; step++) {
    let found = -1;
    for (let i = 1; i <= 8; i++) {
      const dirIndex = (backtrack + i) % 8;
      const nx = cx + OFFSETS[dirIndex][0];
      const ny = cy + OFFSETS[dirIndex][1];
      if (filled(nx, ny)) {
        found = dirIndex;
        cx = nx;
        cy = ny;
        break;
      }
    }
    if (found === -1) break; // célula isolada
    if (cx === startX && cy === startY) break; // circuito fechado
    boundary.push([cx, cy]);
    // o backtrack aponta para a célula de onde viemos: (found+4)%8;
    // a varredura seguinte começa no vizinho logo após ela
    backtrack = (found + 4) % 8;
  }
  return boundary;
}
