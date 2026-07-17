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

/**
 * Faixa de EXIBIÇÃO em metros — não confundir com o HeightRange, que é
 * quantização/armazenamento (D3). A rampa estica sobre ESTA faixa; foi a
 * confusão entre as duas que deixou o relevo invisível (P0-4).
 */
export interface DisplayRange {
  min_m: number;
  max_m: number;
}

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
   * Rampa de cor própria: 256 RGBA cobrindo o DisplayRange (índice 0 = min,
   * 255 = max). null = rampa padrão da visualização final.
   */
  buildRamp: ((range: DisplayRange) => Uint8Array) | null;
  /**
   * De onde vem a faixa da rampa: 'data' = estica para o relevo REAL do
   * mapa; 'storage' = o heightRange inteiro; 'fixed' = fixedRange.
   */
  rangeSource: 'data' | 'storage' | 'fixed';
  fixedRange?: DisplayRange;
  /** intensidade do hillshade sobre a rampa: 0 = sem sombra, 1 = plena */
  hillshade: number;
  /** passadas do shader de terreno */
  showWater: boolean;
  showBiomes: boolean;
  /** overlays 2D (curvas, água vetorial, estradas/regiões/POIs, objetos) */
  overlays: LensOverlayFlags;
}
