import type { TerrainLayer } from '../layers/TerrainLayer';
import type { RiverNode, RiverSpline } from '../layers/WaterLayer';
import { simplifyIndices } from '../geometry/polygon';
import { newId } from '../utils/id';

/**
 * "Água escoa do alto para o baixo" como ASSISTENTE, não simulação
 * (README §4.3):
 *  - D8 flow direction: cada célula aponta para a vizinha mais baixa das 8;
 *  - flow accumulation: quantas células drenam para cada uma;
 *  - células com acumulação > limiar = leito natural → "Sugerir rios".
 *
 * Comando explícito, O(n log n); roda num grid REDUZIDO (≤ maxSide) — a
 * sugestão de rios não precisa da resolução total do heightmap.
 */

export interface D8Result {
  /** células que drenam para cada célula (inclui ela mesma) */
  accumulation: Float64Array;
  /** índice da célula a jusante, ou -1 (fossa/borda) */
  direction: Int32Array;
}

/** Grade REDUZIDA amostrada do heightmap (o D8 não precisa da resolução total). */
interface ReducedGrid {
  heights: Float64Array;
  w: number;
  h: number;
  /** metros por célula reduzida (stride × resolução) */
  cellSize_m: number;
}

/** Amostra o relevo numa grade de lado ≤ maxSide (README §4.3). */
function sampleReducedGrid(
  terrain: TerrainLayer,
  resolution_m: number,
  maxSide: number,
): ReducedGrid {
  const raster = terrain.raster;
  const stride = Math.max(1, Math.ceil(Math.max(raster.widthCells, raster.heightCells) / maxSide));
  const w = Math.floor((raster.widthCells - 1) / stride) + 1;
  const h = Math.floor((raster.heightCells - 1) / stride) + 1;
  const heights = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      heights[y * w + x] = terrain.getHeightAtCell(x * stride, y * stride);
    }
  }
  return { heights, w, h, cellSize_m: stride * resolution_m };
}

export function computeD8(heights: Float64Array, width: number, height: number): D8Result {
  const n = width * height;
  const direction = new Int32Array(n).fill(-1);
  const accumulation = new Float64Array(n).fill(1);

  // direção: vizinha ESTRITAMENTE mais baixa com maior declive
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const h = heights[index];
      let best = -1;
      let bestDrop = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighbor = ny * width + nx;
          const dist = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
          const drop = (h - heights[neighbor]) / dist;
          if (drop > bestDrop) {
            bestDrop = drop;
            best = neighbor;
          }
        }
      }
      direction[index] = best;
    }
  }

  // acumulação: varre do alto para o baixo somando a jusante — O(n log n)
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  const sorted = Array.from(order).sort((a, b) => heights[b] - heights[a]);
  for (const index of sorted) {
    const target = direction[index];
    if (target >= 0) accumulation[target] += accumulation[index];
  }
  return { accumulation, direction };
}

export interface SuggestRiversOptions {
  /** lado máximo do grid reduzido (padrão 1024) */
  maxSide?: number;
  /** limiar de acumulação em células do grid reduzido (padrão 0.2% do total) */
  minAccumulationCells?: number;
  /** quantos rios devolver, dos maiores para os menores (padrão 12) */
  maxRivers?: number;
  /** comprimento mínimo do traçado, em células reduzidas (padrão 12) */
  minLengthCells?: number;
  carveDepth_m?: number;
}

/** Gera splines de rio pelos leitos naturais do relevo (README §4.3). */
export function suggestRivers(
  terrain: TerrainLayer,
  resolution_m: number,
  options: SuggestRiversOptions = {},
): RiverSpline[] {
  const { heights, w, h, cellSize_m } = sampleReducedGrid(terrain, resolution_m, options.maxSide ?? 1024);

  const { accumulation, direction } = computeD8(heights, w, h);
  const threshold = options.minAccumulationCells ?? Math.max(50, Math.round(w * h * 0.002));
  const isRiver = (index: number) => accumulation[index] >= threshold;

  // nascentes: células de rio sem outra célula de rio drenando para elas
  const inflow = new Uint8Array(w * h);
  for (let index = 0; index < w * h; index++) {
    if (!isRiver(index)) continue;
    const target = direction[index];
    if (target >= 0 && isRiver(target)) inflow[target] = 1;
  }

  // nascentes traçadas do ALTO para o baixo: os troncos principais nascem
  // mais alto e devem reivindicar o talvegue antes dos afluentes curtos
  const sources: number[] = [];
  for (let index = 0; index < w * h; index++) {
    if (isRiver(index) && !inflow[index]) sources.push(index);
  }
  sources.sort((a, b) => heights[b] - heights[a]);

  const visited = new Uint8Array(w * h);
  const paths: Array<{ cells: number[]; mouthAccumulation: number }> = [];
  for (const source of sources) {
    const cells: number[] = [];
    let current = source;
    while (current >= 0 && isRiver(current) && !visited[current]) {
      visited[current] = 1;
      cells.push(current);
      current = direction[current];
    }
    // a foz que RANQUEIA é a última célula própria do traçado — usar a
    // célula de junção inflaria afluentes que desembocam perto da foz
    const mouthAccumulation = accumulation[cells[cells.length - 1]];
    if (current >= 0 && visited[current]) cells.push(current); // junta no afluente
    if (cells.length >= (options.minLengthCells ?? 12)) {
      paths.push({ cells, mouthAccumulation });
    }
  }

  // maiores primeiro (acumulação na foz)
  paths.sort((a, b) => b.mouthAccumulation - a.mouthAccumulation);
  const chosen = paths.slice(0, options.maxRivers ?? 12).map((p) => p.cells);

  return chosen.map((path) => {
    const points: Array<[number, number]> = path.map((index) => [
      (index % w) * cellSize_m,
      Math.floor(index / w) * cellSize_m,
    ]);
    const kept = simplifyIndices(points, 2.5 * cellSize_m);

    const nodes: RiverNode[] = [];
    let previousSurface = Infinity;
    for (const pointIndex of kept) {
      const cellIndex = path[pointIndex];
      // largura cresce com a área drenada; cota DEVE decrescer (README §4.3)
      const width_m = Math.min(
        60,
        Math.max(4, Math.sqrt(accumulation[cellIndex]) * cellSize_m * 0.015),
      );
      const surface_m = Math.min(previousSurface - 0.01, heights[cellIndex]);
      previousSurface = surface_m;
      nodes.push({ x: points[pointIndex][0], y: points[pointIndex][1], width_m, surface_m });
    }
    return { id: newId(), nodes, carveDepth_m: options.carveDepth_m ?? 2 };
  });
}

/** Um talvegue traçado: polilinha em metros + acumulação por ponto. */
export interface FlowChannel {
  /** pontos do leito em metros (mundo) */
  points: Array<[number, number]>;
  /** células que drenam para cada ponto — largura/cor ∝ isto */
  accumulation: number[];
}

/** Rede de drenagem inteira + o maior fluxo (para normalizar cor/largura). */
export interface FlowNetworkResult {
  channels: FlowChannel[];
  maxAccumulation: number;
}

export interface FlowNetworkOptions {
  /** lado máximo do grid reduzido (padrão 512 — a lente não precisa de mais) */
  maxSide?: number;
  /** limiar de acumulação para virar leito (padrão 0.2% do grid reduzido) */
  minAccumulationCells?: number;
  /** comprimento mínimo do traçado em células reduzidas (padrão 6) */
  minLengthCells?: number;
}

/**
 * Traça a REDE DE DRENAGEM natural do relevo (P3-2) — a mesma matemática
 * D8 que alimenta "Sugerir rios", mas devolvida como talvegues crus para a
 * lente de Hidrografia DESENHAR, sem virar splines editáveis. Só leitura:
 * mostra para onde a água escoaria, não cria água nenhuma.
 */
export function traceFlowNetwork(
  terrain: TerrainLayer,
  resolution_m: number,
  options: FlowNetworkOptions = {},
): FlowNetworkResult {
  const { heights, w, h, cellSize_m } = sampleReducedGrid(terrain, resolution_m, options.maxSide ?? 512);
  const { accumulation, direction } = computeD8(heights, w, h);
  // limiar mais baixo que "Sugerir rios" (0.06% vs 0.2%): a LENTE mostra a
  // rede fina — afluentes, não só os troncos. O filtro de borda e o peso
  // logarítmico da cor mantêm o resultado limpo.
  const threshold = options.minAccumulationCells ?? Math.max(40, Math.round(w * h * 0.0006));
  const isRiver = (index: number) => accumulation[index] >= threshold;

  // nascentes: leito sem outro leito drenando para ele (mesmo critério do §4.3)
  const inflow = new Uint8Array(w * h);
  for (let index = 0; index < w * h; index++) {
    if (!isRiver(index)) continue;
    const target = direction[index];
    if (target >= 0 && isRiver(target)) inflow[target] = 1;
  }
  const sources: number[] = [];
  for (let index = 0; index < w * h; index++) {
    if (isRiver(index) && !inflow[index]) sources.push(index);
  }
  sources.sort((a, b) => heights[b] - heights[a]); // troncos primeiro

  const visited = new Uint8Array(w * h);
  const channels: FlowChannel[] = [];
  const minLength = options.minLengthCells ?? 6;
  let maxAccumulation = 1;

  for (const source of sources) {
    const cells: number[] = [];
    let current = source;
    while (current >= 0 && isRiver(current) && !visited[current]) {
      visited[current] = 1;
      cells.push(current);
      current = direction[current];
    }
    if (current >= 0 && visited[current]) cells.push(current); // junta no tronco
    if (cells.length < minLength) continue;

    // artefato do D8: num vale plano a água corre para a borda e SEGUE a
    // borda reta do mapa acumulando muito — não é rio, é o retângulo do mapa.
    // Descarta o talvegue que vive INTEIRO na borda (rios de verdade correm
    // pelo interior, mesmo quando desembocam na borda ou no oceano).
    const allOnBorder = cells.every((c) => {
      const cx = c % w;
      const cy = (c - cx) / w;
      return cx === 0 || cy === 0 || cx === w - 1 || cy === h - 1;
    });
    if (allOnBorder) continue;

    const rawPoints: Array<[number, number]> = cells.map((index) => [
      (index % w) * cellSize_m,
      Math.floor(index / w) * cellSize_m,
    ]);
    const kept = simplifyIndices(rawPoints, 1.5 * cellSize_m);
    const points = kept.map((k) => rawPoints[k]);
    const acc = kept.map((k) => accumulation[cells[k]]);
    for (const a of acc) if (a > maxAccumulation) maxAccumulation = a;
    channels.push({ points, accumulation: acc });
  }

  return { channels, maxAccumulation };
}
