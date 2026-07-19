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

const NEIGHBORS4: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * Nível de TRANSBORDO da bacia sob o clique (para "encher lago" realista).
 * spill_m é a cota do rim mais baixo: enchendo até aí, a água fica CONTIDA
 * pelo relevo — não alaga a planície em volta. bottom_m é o fundo alcançável.
 */
export interface BasinFill {
  spill_m: number;
  bottom_m: number;
  /** célula mais funda (em metros): a água jorra e pousa AQUI primeiro */
  bottomSeed: { x: number; y: number };
}

export interface BasinOptions {
  /** raio da janela de busca em células (padrão 160) */
  windowRadius_cells?: number;
}

/** Min-heap binário (índice de célula, prioridade = cota) para o priority-flood. */
class MinHeap {
  private readonly items: Int32Array;
  private readonly prio: Float64Array;
  size = 0;

  constructor(capacity: number) {
    this.items = new Int32Array(capacity);
    this.prio = new Float64Array(capacity);
  }

  push(item: number, priority: number): void {
    let i = this.size++;
    this.items[i] = item;
    this.prio[i] = priority;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent] <= this.prio[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.items[0];
    this.size--;
    if (this.size > 0) {
      this.items[0] = this.items[this.size];
      this.prio[0] = this.prio[this.size];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let m = i;
        if (l < this.size && this.prio[l] < this.prio[m]) m = l;
        if (r < this.size && this.prio[r] < this.prio[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const ti = this.items[a];
    this.items[a] = this.items[b];
    this.items[b] = ti;
    const tp = this.prio[a];
    this.prio[a] = this.prio[b];
    this.prio[b] = tp;
  }
}

/**
 * Priority-flood (Barnes et al.) numa janela ao redor do clique: a BORDA da
 * janela é o exutório (como o mar), e a água sobe do fundo até achar o rim
 * mais baixo que a deixa escapar. Devolve esse nível de transbordo — encher
 * até ele mantém o lago CONTIDO pelo relevo, sem alagar a planície. Devolve
 * null quando o clique não está numa depressão (encosta/planície seca).
 */
export function basinSpillLevel(
  terrain: TerrainLayer,
  resolution_m: number,
  seed: { x: number; y: number },
  options: BasinOptions = {},
): BasinFill | null {
  const raster = terrain.raster;
  const W = raster.widthCells;
  const H = raster.heightCells;
  const sx = worldToCell(seed.x, resolution_m);
  const sy = worldToCell(seed.y, resolution_m);
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return null;

  const R = options.windowRadius_cells ?? 160;
  const x0 = Math.max(0, sx - R);
  const y0 = Math.max(0, sy - R);
  const x1 = Math.min(W - 1, sx + R);
  const y1 = Math.min(H - 1, sy + R);
  const ww = x1 - x0 + 1;
  const wh = y1 - y0 + 1;
  const n = ww * wh;
  const local = (cx: number, cy: number) => (cy - y0) * ww + (cx - x0);

  // filled[c] = cota até a qual a célula é submersa vendo a borda como mar
  const filled = new Float64Array(n).fill(Infinity);
  const heap = new MinHeap(n);
  const pushBorder = (cx: number, cy: number) => {
    const li = local(cx, cy);
    if (filled[li] !== Infinity) return;
    const e = terrain.getHeightAtCell(cx, cy);
    filled[li] = e;
    heap.push(li, e);
  };
  for (let cx = x0; cx <= x1; cx++) {
    pushBorder(cx, y0);
    pushBorder(cx, y1);
  }
  for (let cy = y0; cy <= y1; cy++) {
    pushBorder(x0, cy);
    pushBorder(x1, cy);
  }

  while (heap.size > 0) {
    const li = heap.pop();
    const level = filled[li];
    const cx = x0 + (li % ww);
    const cy = y0 + ((li / ww) | 0);
    for (const [dx, dy] of NEIGHBORS4) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < x0 || ny < y0 || nx > x1 || ny > y1) continue;
      const nli = local(nx, ny);
      if (filled[nli] !== Infinity) continue;
      // a água não afunda abaixo do nível já atingido no caminho até aqui
      const nlevel = Math.max(terrain.getHeightAtCell(nx, ny), level);
      filled[nli] = nlevel;
      heap.push(nli, nlevel);
    }
  }

  const spill = filled[local(sx, sy)];
  const seedElev = terrain.getHeightAtCell(sx, sy);
  if (!(spill > seedElev + 1e-6)) return null; // clique fora de qualquer bacia

  // fundo: menor cota alcançável do clique abaixo do transbordo (e ONDE ele
  // fica — a água pousa lá primeiro, mesmo que o clique tenha sido na encosta)
  let bottom = seedElev;
  let bottomCx = sx;
  let bottomCy = sy;
  const seen = new Uint8Array(n);
  const stack: number[] = [local(sx, sy)];
  seen[stack[0]] = 1;
  while (stack.length > 0) {
    const li = stack.pop() as number;
    const cx = x0 + (li % ww);
    const cy = y0 + ((li / ww) | 0);
    const e = terrain.getHeightAtCell(cx, cy);
    if (e < bottom) {
      bottom = e;
      bottomCx = cx;
      bottomCy = cy;
    }
    for (const [dx, dy] of NEIGHBORS4) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < x0 || ny < y0 || nx > x1 || ny > y1) continue;
      const nli = local(nx, ny);
      if (seen[nli]) continue;
      if (terrain.getHeightAtCell(nx, ny) >= spill) continue;
      seen[nli] = 1;
      stack.push(nli);
    }
  }
  return {
    spill_m: spill,
    bottom_m: bottom,
    bottomSeed: { x: bottomCx * resolution_m, y: bottomCy * resolution_m },
  };
}

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
