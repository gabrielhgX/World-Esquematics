/**
 * Conversão do espaço canônico (D10: X=Leste, Y=Norte, Z=Cima, DESTRO,
 * metros) para o espaço da Unreal (Z-up CANHOTO, centímetros) — o gotcha #3
 * do README §9.1, num lugar só.
 *
 * A conversão escolhida é o espelho do eixo Y: a origem do Landscape fica no
 * canto NOROESTE do mundo (linha 0 do heightmap = norte), o +X continua
 * leste e o +Y da Unreal aponta para o SUL. Consequências:
 *   - posição:  x_ue = x·100;  y_ue = (extentNS − y)·100;  z_ue = z·100
 *   - yaw: ângulos invertem o sinal (CCW destro → yaw canhoto da Unreal)
 *
 * Validado ponta a ponta pelo teste do mapa "L" assimétrico (item 29).
 */

export interface UEVector {
  x: number;
  y: number;
  z: number;
}

export const M_TO_UU = 100; // Unreal units = centímetros

/** Posição canônica (m) → Unreal (uu), com o flip do eixo norte-sul. */
export function positionToUE(
  x_m: number,
  y_m: number,
  z_m: number,
  extentNorthSouth_m: number,
): UEVector {
  return {
    x: x_m * M_TO_UU,
    y: (extentNorthSouth_m - y_m) * M_TO_UU,
    z: z_m * M_TO_UU,
  };
}

/** Rotação em torno de Z: o espelho de Y inverte o sentido do giro. */
export function yawToUE(rotation_deg: number): number {
  return -rotation_deg;
}
