import type { HeightRange } from '../../core';

/**
 * LENTES (modos de visualização do mapa): mudam SÓ a exibição — nunca os
 * dados (mesma disciplina do D6: nada disso persiste).
 *
 * Cada lente é uma DEFINIÇÃO declarativa e independente: rampa de cor
 * própria (opcional), hillshade, quais passadas do shader entram e quais
 * overlays 2D aparecem. Adicionar uma lente nova = acrescentar um objeto ao
 * registro (lenses.ts) — nenhum outro arquivo do editor muda. Futuras:
 * declividade, hidrografia, temperatura, umidade, navegação, recursos…
 */

export interface LensOverlayFlags {
  contours: boolean;
  water: boolean;
  vectors: boolean;
  objects: boolean;
}

export interface LensDefinition {
  id: string;
  name: string;
  description: string;
  /**
   * Rampa de cor própria: 256 RGBA cobrindo o heightRange (índice 0 = min,
   * 255 = max). null = rampa padrão da visualização final.
   */
  buildRamp: ((range: HeightRange) => Uint8Array) | null;
  /** relevo sombreado (hillshade §6.1) por cima da rampa? */
  hillshade: boolean;
  /** passadas do shader de terreno */
  showWater: boolean;
  showBiomes: boolean;
  /** overlays 2D (curvas, água vetorial, estradas/regiões/POIs, objetos) */
  overlays: LensOverlayFlags;
}
