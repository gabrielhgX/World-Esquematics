import type { Layer } from '../world/Layer';
import type { PolygonRing } from '../geometry/polygon';
import { newId } from '../utils/id';

/**
 * BiomeLayer HÍBRIDA (README §4.4): autoria em POLÍGONO (editável, limpo);
 * o raster uint8 é o RESULTADO rasterizado — cache invalidável que vira
 * weightmap na exportação. Regra: polígono é fonte, raster é cache.
 *
 * Escrita SEMPRE via Commands (D7).
 */

export interface VegetationRule {
  objectType: string;
  density_per_ha: number;
  scaleRange: [number, number];
  slopeMax_deg: number;
}

export interface BiomeDefinition {
  /** 0..255 — indexa a paleta; 0 é reservado para "sem bioma" */
  id: number;
  name: string;
  color: string;
  /** nomes que o exportador mapeia */
  materials: string[];
  vegetationRules: VegetationRule[];
}

export interface BiomePolygon {
  id: string;
  biomeId: number;
  polygon: PolygonRing;
  /** transição suave na borda — aplicada no weightmap de exportação */
  featherRadius_m: number;
}

/** Paleta inicial de um mundo novo. */
export function defaultBiomePalette(): BiomeDefinition[] {
  return [
    {
      id: 1,
      name: 'Floresta',
      color: '#2d6a4f',
      materials: ['forest_floor', 'grass_dark'],
      vegetationRules: [
        {
          objectType: 'pine_tree_01',
          density_per_ha: 90,
          scaleRange: [0.7, 1.4],
          slopeMax_deg: 35,
        },
        { objectType: 'oak_tree_01', density_per_ha: 25, scaleRange: [0.8, 1.3], slopeMax_deg: 30 },
      ],
    },
    {
      id: 2,
      name: 'Campo',
      color: '#90a955',
      materials: ['grass'],
      vegetationRules: [
        { objectType: 'bush_01', density_per_ha: 10, scaleRange: [0.6, 1.2], slopeMax_deg: 40 },
      ],
    },
    {
      id: 3,
      name: 'Deserto',
      color: '#d4a373',
      materials: ['sand'],
      vegetationRules: [],
    },
    {
      id: 4,
      name: 'Rocha',
      color: '#8d99ae',
      materials: ['rock'],
      vegetationRules: [],
    },
  ];
}

export class BiomeLayer implements Layer {
  readonly type = 'biome' as const;
  name = 'Biomas';
  visible = true;
  locked = false;
  opacity = 1;
  order = 1;

  readonly palette: BiomeDefinition[] = defaultBiomePalette();

  /**
   * Seed do scatter procedural (§4.7): a regra + o seed são O DADO;
   * as instâncias de vegetação nunca são armazenadas.
   */
  scatterSeed = 1337;

  private readonly items: BiomePolygon[] = [];
  private _version = 0;

  constructor(readonly id: string) {}

  get version(): number {
    return this._version;
  }

  get polygons(): readonly BiomePolygon[] {
    return this.items;
  }

  getBiome(biomeId: number): BiomeDefinition | undefined {
    return this.palette.find((b) => b.id === biomeId);
  }

  /** [Command/loader] substitui a paleta inteira (edição de paleta, load). */
  setPalette(palette: BiomeDefinition[]): void {
    this.palette.splice(0, this.palette.length, ...palette);
    this._version++;
  }

  /** [Command] pinta um polígono de bioma (ordem = ordem de pintura). */
  addPolygon(polygon: BiomePolygon): void {
    this.items.push(polygon);
    this._version++;
  }

  /** [Command] */
  removePolygon(id: string): boolean {
    const index = this.items.findIndex((p) => p.id === id);
    if (index === -1) return false;
    this.items.splice(index, 1);
    this._version++;
    return true;
  }
}

export function createBiomePolygon(
  biomeId: number,
  polygon: PolygonRing,
  featherRadius_m = 0,
): BiomePolygon {
  return { id: newId(), biomeId, polygon, featherRadius_m };
}
