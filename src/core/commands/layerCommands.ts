import type { Command } from './Command';
import type { WorldData } from '../world/WorldData';

/**
 * SetLayerPropertyCommand (README §5.2): muda propriedades de exibição de
 * uma camada (Outliner: hide, lock, renomear, opacidade). Struct barato,
 * sem coalescência.
 */

type MutableLayerProperty = 'visible' | 'locked' | 'name' | 'opacity';

export class SetLayerPropertyCommand implements Command {
  readonly memoryCost = 96;
  private before: boolean | string | number | null = null;

  constructor(
    private readonly layerId: string,
    private readonly property: MutableLayerProperty,
    private readonly value: boolean | string | number,
  ) {}

  get label(): string {
    const names: Record<MutableLayerProperty, string> = {
      visible: 'Mostrar/ocultar camada',
      locked: 'Travar/destravar camada',
      name: 'Renomear camada',
      opacity: 'Opacidade da camada',
    };
    return names[this.property];
  }

  apply(world: WorldData): void {
    const layer = world.layers.getById(this.layerId);
    if (!layer) return;
    if (this.before === null) this.before = layer[this.property];
    (layer as Record<MutableLayerProperty, boolean | string | number>)[this.property] = this.value;
  }

  revert(world: WorldData): void {
    const layer = world.layers.getById(this.layerId);
    if (!layer || this.before === null) return;
    (layer as Record<MutableLayerProperty, boolean | string | number>)[this.property] = this.before;
  }
}
