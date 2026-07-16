import type { Command } from './Command';
import type { WorldData } from '../world/WorldData';
import type { BiomePolygon } from '../layers/BiomeLayer';
import type { MapObject } from '../layers/ObjectLayer';

/** Comandos de biomas e objetos (README §4.4/§4.6, §5.2). */

/** PaintBiomeCommand do §5.2 — aqui por polígono (autoria vetorial, §4.4). */
export class AddBiomePolygonCommand implements Command {
  readonly label = 'Pintar bioma';

  constructor(private readonly polygon: BiomePolygon) {}

  apply(world: WorldData): void {
    world.biomes.addPolygon(this.polygon);
  }

  revert(world: WorldData): void {
    world.biomes.removePolygon(this.polygon.id);
  }

  get memoryCost(): number {
    return 128 + this.polygon.polygon.length * 16;
  }
}

/** AddObjectCommand (§5.2): struct, sem coalescência. */
export class AddObjectCommand implements Command {
  readonly label = 'Adicionar objeto';
  readonly memoryCost = 192;

  constructor(private readonly object: MapObject) {}

  apply(world: WorldData): void {
    world.objects.add(this.object);
  }

  revert(world: WorldData): void {
    world.objects.remove(this.object.id);
  }
}
