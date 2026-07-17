import type { HeightRange } from '../../core';
import type { LensDefinition } from './Lens';

/**
 * Registro de lentes. A primeira é a visualização final (padrão do editor);
 * lentes novas entram AQUI e aparecem sozinhas no seletor da toolbar.
 */

type Rgb = [number, number, number];

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

// Escala pedida (de cima para baixo): marrom escuro (topo) → laranja
// (montanhas) → vermelho (regiões altas) → amarelo (elevadas) → verde (0) →
// verde claro (levemente abaixo) → ciano (baixas) → azul (submerso, ≤ −1 m).
const DARK_BROWN: Rgb = [62, 39, 35];
const ORANGE: Rgb = [230, 126, 34];
const RED: Rgb = [192, 57, 43];
const YELLOW: Rgb = [244, 208, 63];
const GREEN: Rgb = [46, 125, 50];
const LIGHT_GREEN: Rgb = [165, 214, 167];
const CYAN: Rgb = [77, 208, 225];
const BLUE: Rgb = [30, 106, 200];
const DEEP_BLUE: Rgb = [10, 40, 96];

/** limite onde começa o "submerso" da lente de altitude (−1 m, pedido) */
export const ALTITUDE_SUBMERGED_M = -1;

/** Cor da lente de altitude para uma cota (exportada para teste). */
export function altitudeColorAt(h_m: number, range: HeightRange): Rgb {
  const top = Math.max(range.max_m, 1);
  if (h_m >= 0) {
    const f = Math.min(1, h_m / top);
    if (f < 0.15) return mix(GREEN, YELLOW, f / 0.15);
    if (f < 0.35) return mix(YELLOW, RED, (f - 0.15) / 0.2);
    if (f < 0.65) return mix(RED, ORANGE, (f - 0.35) / 0.3);
    return mix(ORANGE, DARK_BROWN, (f - 0.65) / 0.35);
  }
  if (h_m > ALTITUDE_SUBMERGED_M) {
    // 0 → −1 m: verde claro escorrendo para ciano
    return mix(LIGHT_GREEN, CYAN, h_m / ALTITUDE_SUBMERGED_M);
  }
  // submerso: azul escurecendo até o fundo do range
  const bottom = Math.min(range.min_m, ALTITUDE_SUBMERGED_M - 1);
  const f = Math.min(1, (ALTITUDE_SUBMERGED_M - h_m) / (ALTITUDE_SUBMERGED_M - bottom));
  return mix(BLUE, DEEP_BLUE, f);
}

function buildAltitudeRamp(range: HeightRange): Uint8Array {
  const ramp = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const h = range.min_m + (i / 255) * (range.max_m - range.min_m);
    const [r, g, b] = altitudeColorAt(h, range);
    ramp[i * 4] = Math.round(r);
    ramp[i * 4 + 1] = Math.round(g);
    ramp[i * 4 + 2] = Math.round(b);
    ramp[i * 4 + 3] = 255;
  }
  return ramp;
}

export const FINAL_LENS: LensDefinition = {
  id: 'final',
  name: 'Final',
  description: 'Visualização final: hillshade, biomas, água e vetores.',
  buildRamp: null,
  hillshade: true,
  showWater: true,
  showBiomes: true,
  overlays: { contours: true, water: true, vectors: true, objects: true },
};

export const ALTITUDE_LENS: LensDefinition = {
  id: 'altitude',
  name: 'Altitude',
  description: 'Gradiente de cor por altitude — atualiza em tempo real ao esculpir.',
  buildRamp: buildAltitudeRamp,
  hillshade: false,
  showWater: false,
  showBiomes: false,
  overlays: { contours: true, water: false, vectors: false, objects: false },
};

export const LENSES: LensDefinition[] = [FINAL_LENS, ALTITUDE_LENS];

export function getLens(id: string): LensDefinition {
  return LENSES.find((lens) => lens.id === id) ?? FINAL_LENS;
}
