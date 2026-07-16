import type { Layer } from '../world/Layer';
import type { Pt } from '../geometry/bezier';

/**
 * Pontos de interesse (README §4.6). Escrita SEMPRE via Commands (D7).
 * O Z é derivado do terreno — POIs só têm posição 2D.
 */
export interface POI {
  id: string;
  name: string;
  icon: string;
  pos: Pt;
  properties: Record<string, unknown>;
}

export class POILayer implements Layer {
  readonly type = 'poi' as const;
  name = 'POIs';
  visible = true;
  locked = false;
  opacity = 1;
  order = 5;

  private readonly items: POI[] = [];
  private _version = 0;

  constructor(readonly id: string) {}

  get version(): number {
    return this._version;
  }

  get pois(): readonly POI[] {
    return this.items;
  }

  /** [Command] */
  add(poi: POI): void {
    this.items.push(poi);
    this._version++;
  }

  /** [Command] */
  remove(id: string): boolean {
    const index = this.items.findIndex((p) => p.id === id);
    if (index === -1) return false;
    this.items.splice(index, 1);
    this._version++;
    return true;
  }
}
