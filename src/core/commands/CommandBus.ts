import type { Command } from './Command';
import type { WorldData } from '../world/WorldData';
import { History } from './History';
import { EventEmitter } from '../utils/EventEmitter';

export type CommandBusEvents = {
  executed: { command: Command };
  undone: { command: Command };
  redone: { command: Command };
};

/**
 * A ÚNICA porta de escrita do WorldData (README §2):
 *
 *   Tool → Command → CommandBus.execute() → WorldData.mutate()
 *                                         → marca tiles sujos (no próprio Command)
 *                                         → emite evento
 *                                         → Viewport redesenha só o sujo
 */
export class CommandBus {
  readonly events = new EventEmitter<CommandBusEvents>();

  constructor(
    private readonly world: WorldData,
    readonly history: History = new History(),
  ) {}

  /** Aplica o comando ao mundo e o empilha no histórico. */
  execute(command: Command, options?: { coalesce?: boolean }): void {
    command.apply(this.world);
    this.history.push(command, options?.coalesce ?? false);
    this.events.emit('executed', { command });
  }

  /** Fecha a coalescência do traço atual (chamar no mouseup). */
  sealCoalescing(): void {
    this.history.sealTop();
  }

  undo(): boolean {
    const command = this.history.undo(this.world);
    if (command) this.events.emit('undone', { command });
    return command !== null;
  }

  redo(): boolean {
    const command = this.history.redo(this.world);
    if (command) this.events.emit('redone', { command });
    return command !== null;
  }
}
