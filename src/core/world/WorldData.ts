import type { WorldConfig } from './WorldConfig';
import { LayerStack } from './LayerStack';

/**
 * ★ WORLD DATA — a verdade única (README §2, D1).
 *
 * Puro: sem I/O, sem UI, sem engine. Roda em Node.js num teste unitário.
 * Toda mutação entra pelo CommandBus (D7) — ferramentas NUNCA escrevem aqui
 * diretamente; elas emitem Commands.
 */
export class WorldData {
  readonly layers = new LayerStack();

  constructor(readonly config: WorldConfig) {}
}
