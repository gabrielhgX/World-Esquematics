import type { WorldConfig } from './WorldConfig';
import { LayerStack } from './LayerStack';
import { TerrainLayer } from '../layers/TerrainLayer';
import { WaterLayer } from '../layers/WaterLayer';
import { newId } from '../utils/id';

/**
 * ★ WORLD DATA — a verdade única (README §2, D1).
 *
 * Puro: sem I/O, sem UI, sem engine. Roda em Node.js num teste unitário.
 * Toda mutação entra pelo CommandBus (D7) — ferramentas NUNCA escrevem aqui
 * diretamente; elas emitem Commands.
 */
export class WorldData {
  readonly layers = new LayerStack();

  /** o relevo é singleton (README §4.1) — nasce com o mundo */
  readonly terrain: TerrainLayer;

  /** camada d'água padrão, com o oceano global (README §4.3/§7.2) */
  readonly water: WaterLayer;

  constructor(readonly config: WorldConfig) {
    this.terrain = new TerrainLayer(config, newId());
    this.layers.add(this.terrain);
    this.water = new WaterLayer(newId());
    this.layers.add(this.water);
  }
}
