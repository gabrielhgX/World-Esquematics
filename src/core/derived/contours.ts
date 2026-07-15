/**
 * Curvas de nível por MARCHING SQUARES (README §6.2, D6).
 *
 * Função pura sobre um amostrador de alturas — derivado, NUNCA persiste.
 * O cache/invalidamento por dirty tile fica no ContourCache.
 */

export interface ContourLevelLines {
  level_m: number;
  /** a cada 5ª linha: mais grossa, com rótulo (README §6.2) */
  isIndex: boolean;
  /** segmentos [x0,y0,x1,y1]* em METROS do mundo */
  segments: Float64Array;
}

export interface TileContours {
  levels: ContourLevelLines[];
}

export interface ContourOptions {
  /** altura em METROS no ponto de amostragem da célula (deve clampar a borda) */
  sampleHeight: (cx: number, cy: number) => number;
  /** canto do bloco, em células */
  cellX0: number;
  cellY0: number;
  /** quantos QUADRADOS processar em cada eixo (célula i..i+1) */
  squaresX: number;
  squaresY: number;
  resolution_m: number;
  interval_m: number;
  /** a cada quantas linhas vem uma linha-índice (padrão 5) */
  indexEvery?: number;
}

// Arestas do quadrado: 0=inferior (A→B), 1=direita (B→C), 2=superior (D→C), 3=esquerda (A→D)
// Cantos: A=(i,j), B=(i+1,j), C=(i+1,j+1), D=(i,j+1); bits: A=1, B=2, C=4, D=8.
const CASE_SEGMENTS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  /* 0  */ [],
  /* 1  */ [[3, 0]],
  /* 2  */ [[0, 1]],
  /* 3  */ [[3, 1]],
  /* 4  */ [[1, 2]],
  /* 5  */ [], // sela — resolvida pelo centro
  /* 6  */ [[0, 2]],
  /* 7  */ [[3, 2]],
  /* 8  */ [[2, 3]],
  /* 9  */ [[2, 0]],
  /* 10 */ [], // sela
  /* 11 */ [[2, 1]],
  /* 12 */ [[1, 3]],
  /* 13 */ [[1, 0]],
  /* 14 */ [[0, 3]],
  /* 15 */ [],
];

export function computeTileContours(options: ContourOptions): TileContours {
  const {
    sampleHeight,
    cellX0,
    cellY0,
    squaresX,
    squaresY,
    resolution_m: res,
    interval_m,
    indexEvery = 5,
  } = options;
  if (squaresX <= 0 || squaresY <= 0 || !(interval_m > 0)) return { levels: [] };

  // Amostra os cantos uma única vez (squares+1 pontos por eixo).
  const width = squaresX + 1;
  const height = squaresY + 1;
  const heights = new Float64Array(width * height);
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const h = sampleHeight(cellX0 + i, cellY0 + j);
      heights[j * width + i] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }

  const firstLevel = Math.ceil(min / interval_m);
  const lastLevel = Math.floor(max / interval_m);
  const levels: ContourLevelLines[] = [];

  for (let k = firstLevel; k <= lastLevel; k++) {
    const level = k * interval_m;
    const points: number[] = [];

    for (let j = 0; j < squaresY; j++) {
      for (let i = 0; i < squaresX; i++) {
        const hA = heights[j * width + i];
        const hB = heights[j * width + i + 1];
        const hC = heights[(j + 1) * width + i + 1];
        const hD = heights[(j + 1) * width + i];
        const sqMin = Math.min(hA, hB, hC, hD);
        const sqMax = Math.max(hA, hB, hC, hD);
        // `>` (não `>=`): o nível pode coincidir exatamente com um canto.
        if (level < sqMin || level > sqMax) continue;

        const caseIndex =
          (hA >= level ? 1 : 0) |
          (hB >= level ? 2 : 0) |
          (hC >= level ? 4 : 0) |
          (hD >= level ? 8 : 0);

        let pairs = CASE_SEGMENTS[caseIndex];
        if (caseIndex === 5 || caseIndex === 10) {
          // Sela: decide a topologia pela média do centro.
          const centerAbove = (hA + hB + hC + hD) / 4 >= level;
          if (caseIndex === 5) {
            pairs = centerAbove
              ? [
                  [0, 1],
                  [2, 3],
                ]
              : [
                  [3, 0],
                  [1, 2],
                ];
          } else {
            pairs = centerAbove
              ? [
                  [3, 0],
                  [1, 2],
                ]
              : [
                  [0, 1],
                  [2, 3],
                ];
          }
        }

        for (const [edgeA, edgeB] of pairs) {
          const [x0, y0] = edgePoint(edgeA, i, j, hA, hB, hC, hD, level);
          const [x1, y1] = edgePoint(edgeB, i, j, hA, hB, hC, hD, level);
          // Nível tocando exatamente um canto gera segmento de comprimento
          // zero — descartado, é ruído de render.
          if (Math.abs(x0 - x1) < 1e-9 && Math.abs(y0 - y1) < 1e-9) continue;
          points.push(
            (cellX0 + x0) * res,
            (cellY0 + y0) * res,
            (cellX0 + x1) * res,
            (cellY0 + y1) * res,
          );
        }
      }
    }

    if (points.length > 0) {
      levels.push({
        level_m: level,
        isIndex: k % indexEvery === 0,
        segments: Float64Array.from(points),
      });
    }
  }

  return { levels };
}

/** Interpola o cruzamento do nível na aresta; devolve (x,y) em CÉLULAS locais. */
function edgePoint(
  edge: number,
  i: number,
  j: number,
  hA: number,
  hB: number,
  hC: number,
  hD: number,
  level: number,
): [number, number] {
  switch (edge) {
    case 0: // inferior: A(i,j) → B(i+1,j)
      return [i + interpolate(hA, hB, level), j];
    case 1: // direita: B(i+1,j) → C(i+1,j+1)
      return [i + 1, j + interpolate(hB, hC, level)];
    case 2: // superior: D(i,j+1) → C(i+1,j+1)
      return [i + interpolate(hD, hC, level), j + 1];
    default: // 3, esquerda: A(i,j) → D(i,j+1)
      return [i, j + interpolate(hA, hD, level)];
  }
}

function interpolate(h0: number, h1: number, level: number): number {
  const denom = h1 - h0;
  if (Math.abs(denom) < 1e-12) return 0.5;
  return Math.min(1, Math.max(0, (level - h0) / denom));
}
