import type { Command } from './Command';
import type { WorldData } from '../world/WorldData';
import type { RiverSpline, WaterBody } from '../layers/WaterLayer';

/**
 * Comandos da água (README §5.2). Os cálculos caros (flood, D8) acontecem
 * ANTES, na ferramenta — o comando só guarda o resultado, então apply/revert
 * são baratos e determinísticos para redo.
 */

/** "Preencher lago" (§7.2): custo = polígono; sem coalescência (§5.2). */
export class FloodFillWaterCommand implements Command {
  readonly label = 'Preencher lago';

  constructor(private readonly body: WaterBody) {}

  apply(world: WorldData): void {
    world.water.addBody(this.body);
  }

  revert(world: WorldData): void {
    world.water.removeBody(this.body.id);
  }

  get memoryCost(): number {
    return 128 + this.body.polygon.length * 16;
  }
}

/** Adiciona rios (desenhados ou sugeridos pelo D8) — um comando, N splines. */
export class AddRiversCommand implements Command {
  constructor(
    readonly label: string,
    private readonly rivers: RiverSpline[],
  ) {}

  apply(world: WorldData): void {
    for (const river of this.rivers) world.water.addRiver(river);
  }

  revert(world: WorldData): void {
    for (const river of this.rivers) world.water.removeRiver(river.id);
  }

  get memoryCost(): number {
    return this.rivers.reduce((sum, r) => sum + 64 + r.nodes.length * 32, 128);
  }
}

/**
 * Nível do mar (§7.2): mudar a cota reflete instantaneamente (é só o
 * shader). Coalesce durante o ajuste contínuo do campo numérico.
 */
export class SetSeaLevelCommand implements Command {
  readonly label = 'Nível do mar';
  readonly memoryCost = 64;

  private before: { level: number; enabled: boolean } | null = null;

  /**
   * Definir a cota LIGA o oceano por padrão (é o gesto de "colocar o mar");
   * `enabled: false` desliga — água nunca aparece sem gesto explícito.
   */
  constructor(
    private after: number,
    private afterEnabled = true,
  ) {}

  apply(world: WorldData): void {
    if (this.before === null) {
      this.before = { level: world.water.seaLevel_m, enabled: world.water.oceanEnabled };
    }
    world.water.setSeaLevel(this.after);
    world.water.setOceanEnabled(this.afterEnabled);
  }

  revert(world: WorldData): void {
    if (this.before === null) return;
    world.water.setSeaLevel(this.before.level);
    world.water.setOceanEnabled(this.before.enabled);
  }

  mergeWith(next: Command): Command | null {
    if (!(next instanceof SetSeaLevelCommand)) return null;
    this.after = next.after; // o before mais antigo permanece
    this.afterEnabled = next.afterEnabled;
    return this;
  }
}
