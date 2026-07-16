import type { Layer } from '../world/Layer';
import type { Pt } from '../geometry/bezier';

/**
 * Objetos MANUAIS (README §4.6/§4.7): casas, pontes, marcos — lista de
 * structs, milhares, OK. Vegetação NÃO vive aqui: é regra + seed no bioma,
 * gerada por scatter determinístico (nunca milhões de instâncias).
 *
 * Z do objeto é DERIVADO: z = terrain.getHeight(x,y) + z_offset_m — nunca
 * armazene Z absoluto, senão o objeto flutua ao esculpir o terreno.
 */
export interface MapObject {
  id: string;
  /** "pine_tree_01", "house_medieval_02"… */
  type: string;
  pos: Pt;
  /** 0 = colado no terreno (padrão) */
  z_offset_m: number;
  /** rotação em Z (yaw) */
  rotation_deg: number;
  scale: { x: number; y: number; z: number };
  alignToSlope: boolean;
  tags: string[];
}

export class ObjectLayer implements Layer {
  readonly type = 'object' as const;
  name = 'Objetos';
  visible = true;
  locked = false;
  opacity = 1;
  order = 6;

  private readonly items: MapObject[] = [];
  private _version = 0;

  constructor(readonly id: string) {}

  get version(): number {
    return this._version;
  }

  get objects(): readonly MapObject[] {
    return this.items;
  }

  /** [Command] */
  add(object: MapObject): void {
    this.items.push(object);
    this._version++;
  }

  /** [Command] */
  remove(id: string): boolean {
    const index = this.items.findIndex((o) => o.id === id);
    if (index === -1) return false;
    this.items.splice(index, 1);
    this._version++;
    return true;
  }
}
