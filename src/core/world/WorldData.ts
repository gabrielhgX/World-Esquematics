import type { WorldConfig } from './WorldConfig';
import { LayerStack } from './LayerStack';
import { TerrainLayer } from '../layers/TerrainLayer';
import { BiomeLayer } from '../layers/BiomeLayer';
import { WaterLayer } from '../layers/WaterLayer';
import { RoadLayer } from '../layers/RoadLayer';
import { RegionLayer } from '../layers/RegionLayer';
import { POILayer } from '../layers/POILayer';
import { ObjectLayer } from '../layers/ObjectLayer';
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

  /** biomas híbridos: polígono fonte, raster cache (README §4.4) */
  readonly biomes: BiomeLayer;

  /** camada d'água padrão, com o oceano global (README §4.3/§7.2) */
  readonly water: WaterLayer;

  /** grafo planar de estradas (README §4.5, D9) */
  readonly roads: RoadLayer;

  readonly regions: RegionLayer;
  readonly pois: POILayer;

  /** objetos manuais (README §4.6) — vegetação é regra+seed no bioma */
  readonly objects: ObjectLayer;

  constructor(readonly config: WorldConfig) {
    this.terrain = new TerrainLayer(config, newId());
    this.layers.add(this.terrain);
    this.biomes = new BiomeLayer(newId());
    this.layers.add(this.biomes);
    this.water = new WaterLayer(newId());
    this.layers.add(this.water);
    this.roads = new RoadLayer(newId());
    this.layers.add(this.roads);
    this.regions = new RegionLayer(newId());
    this.layers.add(this.regions);
    this.pois = new POILayer(newId());
    this.layers.add(this.pois);
    this.objects = new ObjectLayer(newId());
    this.layers.add(this.objects);
  }
}
