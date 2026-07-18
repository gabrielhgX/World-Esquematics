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

/**
 * Tamanho válido para o grid pedido.
 *
 * Padrão 'up' (P1-6): o MENOR tamanho ≥ pedido — reamostrar para cima não
 * perde dado; o "mais próximo" podia reduzir a resolução em silêncio (3000
 * → 2017 = −33% do que o usuário escolheu de propósito). 'nearest' fica
 * como opção EXPLÍCITA de redução. Acima de 8129 não há opção: reduz, e o
 * exportador avisa.
 */
export function nearestLandscapeSize(vertices: number, mode: 'up' | 'nearest' = 'up'): number {
  if (mode === 'up') {
    for (const size of UNREAL_LANDSCAPE_SIZES) {
      if (size >= vertices) return size;
    }
    return UNREAL_LANDSCAPE_SIZES[UNREAL_LANDSCAPE_SIZES.length - 1];
  }
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
