import type { Layer } from '../world/Layer';
import type { PolygonRing } from '../geometry/polygon';

/**
 * Regiões nomeadas (README §4.6): polígonos com metadados livres do usuário.
 * Escrita SEMPRE via Commands (D7).
 */
export interface Region {
  id: string;
  name: string;
  description: string;
  polygon: PolygonRing;
  color: string;
  properties: Record<string, unknown>;
}

export class RegionLayer implements Layer {
  readonly type = 'region' as const;
  name = 'Regiões';
  visible = true;
  locked = false;
  opacity = 1;
  order = 3;

  private readonly items: Region[] = [];
  private _version = 0;

  constructor(readonly id: string) {}

  get version(): number {
    return this._version;
  }

  get regions(): readonly Region[] {
    return this.items;
  }

  /** [Command] */
  add(region: Region): void {
    this.items.push(region);
    this._version++;
  }

  /** [Command] */
  remove(id: string): boolean {
    const index = this.items.findIndex((r) => r.id === id);
    if (index === -1) return false;
    this.items.splice(index, 1);
    this._version++;
    return true;
  }
}
