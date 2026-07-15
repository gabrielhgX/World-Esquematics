/**
 * Resoluções recomendadas do Landscape da Unreal, em VÉRTICES por lado
 * (README §9.1, gotcha #1). O grid do projeto raramente cai nelas — o
 * exportador reamostra (bicúbico) para o tamanho válido mais próximo e
 * informa o usuário.
 *
 * ATENÇÃO (README): confirmar esta tabela na doc da versão exata da engine
 * alvo antes do plugin importador (Fase 6) ser fechado.
 */
export const UNREAL_LANDSCAPE_SIZES = [127, 253, 505, 1009, 2017, 4033, 8129] as const;

/** Tamanho válido mais próximo do pedido (empate → o maior, sem perda). */
export function nearestLandscapeSize(vertices: number): number {
  let best: number = UNREAL_LANDSCAPE_SIZES[0];
  for (const size of UNREAL_LANDSCAPE_SIZES) {
    const currentDelta = Math.abs(size - vertices);
    const bestDelta = Math.abs(best - vertices);
    if (currentDelta < bestDelta || (currentDelta === bestDelta && size > best)) {
      best = size;
    }
  }
  return best;
}
