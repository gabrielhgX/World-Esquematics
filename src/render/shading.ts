import type { DataRange } from '../core';

/**
 * ESPELHO PURO da matemática de exibição do fragment shader
 * (TerrainRenderer.ts) — mesma fórmula, mesmo sol, mesma rampa.
 *
 * Existe por causa do teste de PERCEPÇÃO (P0-8): o bug do "terreno verde
 * chapado" passou por 4.000 linhas de teste porque todos verificavam dados
 * e nenhum verificava o que o usuário vê. Se mudar o shader, mude aqui —
 * o teste quebra se os dois divergirem no resultado.
 */

/** sol cartográfico: azimute 315°, elevação 45° (README §6.1) */
const SUN = normalize3(-0.5, 0.5, 0.7071);

/** alvo do z-factor automático: gradiente típico renderizado como ~30° */
const AUTO_Z_TARGET = Math.tan((30 * Math.PI) / 180);
export const Z_FACTOR_MIN = 1;
export const Z_FACTOR_MAX = 20;

/** Fator de sombreamento (0.4..1) para um gradiente (m/m) e z-factor. */
export function hillshadeFactor(gx: number, gy: number, zFactor: number): number {
  const n = normalize3(-gx * zFactor, -gy * zFactor, 1);
  const lambert = Math.max(n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2], 0);
  return 0.4 + 0.6 * lambert;
}

/** z-factor automático: tan(30°) / gradiente típico, limitado a [1, 20]. */
export function autoZFactor(gradientP95: number): number {
  if (!(gradientP95 > 1e-9)) return Z_FACTOR_MIN; // mapa plano: nada a exagerar
  return Math.min(Z_FACTOR_MAX, Math.max(Z_FACTOR_MIN, AUTO_Z_TARGET / gradientP95));
}

/**
 * Rampa hipsométrica PADRÃO (lente Final), normalizada pelo DisplayRange —
 * não pelo heightRange de armazenamento (a causa raiz do verde chapado).
 * Espelha ramp() do shader; devolve RGB 0..255.
 */
export function defaultRampColor(h_m: number, display: DataRange): [number, number, number] {
  if (h_m < 0) {
    const b = clamp01(h_m / Math.min(display.min_m, -1));
    return mix([89, 107, 122], [41, 56, 77], b);
  }
  const t = clamp01(h_m / Math.max(display.max_m, 1));
  const c1: Rgb = [82, 117, 66];
  const c2: Rgb = [140, 140, 82];
  const c3: Rgb = [133, 107, 77];
  const c4: Rgb = [158, 153, 148];
  const c5: Rgb = [237, 240, 242];
  if (t < 0.25) return mix(c1, c2, t / 0.25);
  if (t < 0.5) return mix(c2, c3, (t - 0.25) / 0.25);
  if (t < 0.75) return mix(c3, c4, (t - 0.5) / 0.25);
  return mix(c4, c5, (t - 0.75) / 0.25);
}

type Rgb = [number, number, number];

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function normalize3(x: number, y: number, z: number): [number, number, number] {
  const len = Math.hypot(x, y, z);
  return [x / len, y / len, z / len];
}
