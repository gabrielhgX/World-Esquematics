/**
 * Transformada de distância euclidiana EXATA (Felzenszwalb–Huttenlocher):
 * para cada célula, a distância ao "1" mais próximo de uma máscara binária,
 * em O(n) via envelope inferior de parábolas, separável por eixo.
 *
 * Uso no produto: a borda suave (`featherRadius_m`) dos weightmaps de bioma
 * na exportação (README §4.4/§9.1) — a distância assinada até a fronteira do
 * bioma vira a rampa 0→1 do weightmap.
 */

const INF = 1e20;

/**
 * Distância euclidiana (em células) de cada célula até a célula com
 * `mask[i] !== 0` mais próxima. Células sem nenhum "1" no grid ficam com
 * um valor enorme (sem alvo).
 */
export function distanceToMask(mask: Uint8Array, width: number, height: number): Float32Array {
  if (mask.length !== width * height) {
    throw new RangeError(`Máscara com ${mask.length} células; esperado ${width * height}.`);
  }
  const squared = new Float32Array(width * height);
  for (let i = 0; i < mask.length; i++) squared[i] = mask[i] !== 0 ? 0 : INF;

  // colunas, depois linhas (a transformada é separável)
  const column = new Float64Array(height);
  const rowOut = new Float64Array(Math.max(width, height));
  const v = new Int32Array(Math.max(width, height));
  const z = new Float64Array(Math.max(width, height) + 1);

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) column[y] = squared[y * width + x];
    dt1d(column, height, rowOut, v, z);
    for (let y = 0; y < height; y++) squared[y * width + x] = rowOut[y];
  }
  const row = new Float64Array(width);
  for (let y = 0; y < height; y++) {
    const base = y * width;
    for (let x = 0; x < width; x++) row[x] = squared[base + x];
    dt1d(row, width, rowOut, v, z);
    for (let x = 0; x < width; x++) squared[base + x] = rowOut[x];
  }

  for (let i = 0; i < squared.length; i++) squared[i] = Math.sqrt(squared[i]);
  return squared;
}

/** Envelope inferior de parábolas sobre uma linha (F–H, caso 1D). */
function dt1d(f: Float64Array, n: number, out: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const d = q - v[k];
    out[q] = d * d + f[v[k]];
  }
}
