import type { Layer } from '../world/Layer';
import type { PolygonRing } from '../geometry/polygon';
import { pointInPolygon } from '../geometry/polygon';
import { newId } from '../utils/id';

/**
 * WaterLayer (README §4.3, D8): o terreno CONTINUA embaixo da água — nunca
 * existe buraco no heightmap. Corpos d'água têm cota de superfície e a
 * profundidade é DERIVADA: depth = surface_m − terrain.getHeight(x,y);
 * depth ≤ 0 → terra seca (a margem se resolve sozinha).
 *
 * Escrita SEMPRE via Commands (D7) — os mutadores abaixo são chamados só
 * por comandos.
 */

export type WaterBodyKind = 'ocean' | 'lake' | 'river' | 'pond';

export interface WaterBody {
  id: string;
  kind: WaterBodyKind;
  /** cota da superfície (constante em lagos/mar) */
  surface_m: number;
  /** extensão horizontal (lagos, mar); vazio no oceano = global */
  polygon: PolygonRing;
  material: string;
}

/** Rios são SPLINES, não polígonos (README §4.3). */
export interface RiverNode {
  x: number;
  y: number;
  width_m: number;
  /** DEVE decrescer ao longo do rio */
  surface_m: number;
}

export interface RiverSpline {
  id: string;
  nodes: RiverNode[];
  carveDepth_m: number;
  // flowDirection: derivado da ordem dos nós (README §4.3)
}

export class WaterLayer implements Layer {
  readonly type = 'water' as const;
  name = 'Água';
  visible = true;
  locked = false;
  opacity = 1;
  order = 2;

  /** nível do mar global (README §7.2): um WaterBody kind ocean, uma cota */
  readonly ocean: WaterBody;

  /**
   * O oceano começa DESLIGADO: escavar o terreno nunca faz água aparecer
   * sozinha — água só existe quando o usuário a coloca (ferramenta Água).
   * Ligar/desligar é mutação com versão (caches derivados reagem).
   */
  private _oceanEnabled = false;

  private readonly bodies: WaterBody[] = [];
  private readonly riverSplines: RiverSpline[] = [];
  /** bumpa a cada mutação — caches derivados comparam para invalidar (D6) */
  private _version = 0;

  constructor(readonly id: string) {
    this.ocean = {
      id: newId(),
      kind: 'ocean',
      surface_m: 0,
      polygon: [],
      material: 'water_ocean',
    };
  }

  get version(): number {
    return this._version;
  }

  get seaLevel_m(): number {
    return this.ocean.surface_m;
  }

  /** [Command] muda a cota do mar — reflete instantaneamente (só o shader). */
  setSeaLevel(surface_m: number): void {
    this.ocean.surface_m = surface_m;
    this.touch();
  }

  get oceanEnabled(): boolean {
    return this._oceanEnabled;
  }

  /** [Command/loader] liga ou desliga o oceano global. */
  setOceanEnabled(enabled: boolean): void {
    if (this._oceanEnabled === enabled) return;
    this._oceanEnabled = enabled;
    this.touch();
  }

  /** Lagos/lagoas (o oceano fica fora desta lista). */
  get lakes(): readonly WaterBody[] {
    return this.bodies;
  }

  get rivers(): readonly RiverSpline[] {
    return this.riverSplines;
  }

  /** [Command] */
  addBody(body: WaterBody): void {
    this.bodies.push(body);
    this.touch();
  }

  /** [Command] */
  removeBody(id: string): boolean {
    const index = this.bodies.findIndex((b) => b.id === id);
    if (index === -1) return false;
    this.bodies.splice(index, 1);
    this.touch();
    return true;
  }

  /** [Command] */
  addRiver(river: RiverSpline): void {
    this.riverSplines.push(river);
    this.touch();
  }

  /** [Command] */
  removeRiver(id: string): boolean {
    const index = this.riverSplines.findIndex((r) => r.id === id);
    if (index === -1) return false;
    this.riverSplines.splice(index, 1);
    this.touch();
    return true;
  }

  /**
   * Cota da superfície d'água mais alta cobrindo o ponto (oceano é global;
   * lagos valem dentro do polígono). Profundidade = surface − altura do
   * terreno, calculada por quem chama.
   */
  surfaceAt(x_m: number, y_m: number): number {
    // oceano desligado: nenhuma superfície global — só lagos contam
    let surface = this._oceanEnabled ? this.ocean.surface_m : -Infinity;
    for (const body of this.bodies) {
      if (body.surface_m > surface && pointInPolygon(x_m, y_m, body.polygon)) {
        surface = body.surface_m;
      }
    }
    return surface;
  }

  private touch(): void {
    this._version++;
  }
}
