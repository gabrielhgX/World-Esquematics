/**
 * Interface comum a todas as camadas de dados (README §4.1).
 * São 7 camadas de dados, não 17 sistemas (README §3).
 */

export type LayerType = 'terrain' | 'water' | 'biome' | 'road' | 'region' | 'poi' | 'object';

export interface Layer {
  readonly id: string;
  name: string;
  readonly type: LayerType;
  visible: boolean;
  locked: boolean;
  /** [0..1] */
  opacity: number;
  /** posição na pilha (ordem de desenho) */
  order: number;
}
