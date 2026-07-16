import type { WorldData } from '../world/WorldData';

/**
 * Command pattern desde o commit 1 (README §5, D7).
 * Toda escrita no WorldData passa por aqui. Sem exceção.
 */
export interface Command {
  /** rótulo para a UI: "Esculpir terreno", "Mover objeto"… */
  readonly label: string;

  apply(world: WorldData): void;
  revert(world: WorldData): void;

  /** custo em bytes, para o orçamento do histórico em MB (README §5.1) */
  readonly memoryCost: number;

  /**
   * Coalescência: um traço de mouse gera ~100 eventos que devem virar UM
   * comando (README §5.1). Devolve o comando fundido, ou null se o próximo
   * comando não for compatível.
   */
  mergeWith?(next: Command): Command | null;
}
