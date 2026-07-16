import type { Command } from './Command';
import type { WorldData } from '../world/WorldData';
import type { Region } from '../layers/RegionLayer';
import type { POI } from '../layers/POILayer';

/** Comandos das camadas vetoriais simples (README §4.6). */

export class AddRegionCommand implements Command {
  readonly label = 'Criar região';

  constructor(private readonly region: Region) {}

  apply(world: WorldData): void {
    world.regions.add(this.region);
  }

  revert(world: WorldData): void {
    world.regions.remove(this.region.id);
  }

  get memoryCost(): number {
    return 128 + this.region.polygon.length * 16;
  }
}

export class AddPOICommand implements Command {
  readonly label = 'Adicionar POI';
  readonly memoryCost = 128;

  constructor(private readonly poi: POI) {}

  apply(world: WorldData): void {
    world.pois.add(this.poi);
  }

  revert(world: WorldData): void {
    world.pois.remove(this.poi.id);
  }
}
