import type { Command } from './Command';
import type { WorldData } from '../world/WorldData';

interface HistoryEntry {
  command: Command;
  /** aberto = ainda aceita coalescência (traço em andamento; fecha no mouseup) */
  open: boolean;
}

/** Teto padrão do histórico: 512 MB (exemplo do README §5.1). */
export const DEFAULT_HISTORY_BUDGET_BYTES = 512_000_000;

/**
 * Histórico de undo/redo com ORÇAMENTO EM MB, não em contagem (README §5.1):
 * 50 comandos de sculpt e 50 de "renomear objeto" têm custos que diferem em
 * 10.000×. Ao estourar o orçamento, descarta os mais antigos.
 */
export class History {
  private readonly undoStack: HistoryEntry[] = [];
  private redoStack: Command[] = [];

  constructor(readonly budgetBytes: number = DEFAULT_HISTORY_BUDGET_BYTES) {}

  /**
   * Empilha um comando JÁ APLICADO ao mundo (quem aplica é o CommandBus).
   * Com `coalesce = true`, tenta fundir com o comando aberto no topo via
   * `mergeWith`; o traço é fechado por `sealTop()` (mouseup).
   */
  push(command: Command, coalesce = false): void {
    this.redoStack = [];
    const top = this.undoStack[this.undoStack.length - 1];
    if (coalesce && top?.open && top.command.mergeWith) {
      const merged = top.command.mergeWith(command);
      if (merged) {
        top.command = merged;
        this.enforceBudget();
        return;
      }
    }
    this.undoStack.push({ command, open: coalesce });
    this.enforceBudget();
  }

  /** Fecha o comando do topo para novas coalescências (fim do traço). */
  sealTop(): void {
    const top = this.undoStack[this.undoStack.length - 1];
    if (top) top.open = false;
  }

  undo(world: WorldData): Command | null {
    this.sealTop();
    const entry = this.undoStack.pop();
    if (!entry) return null;
    entry.command.revert(world);
    this.redoStack.push(entry.command);
    return entry.command;
  }

  redo(world: WorldData): Command | null {
    const command = this.redoStack.pop();
    if (!command) return null;
    command.apply(world);
    this.undoStack.push({ command, open: false });
    return command;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoCount(): number {
    return this.undoStack.length;
  }

  get redoCount(): number {
    return this.redoStack.length;
  }

  /** Soma dos custos declarados pelos comandos das duas pilhas. */
  get usedBytes(): number {
    let total = 0;
    for (const entry of this.undoStack) total += entry.command.memoryCost;
    for (const command of this.redoStack) total += command.memoryCost;
    return total;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack = [];
  }

  /** Descarta os mais antigos até caber no orçamento (mantém ao menos o último). */
  private enforceBudget(): void {
    while (this.usedBytes > this.budgetBytes && this.undoStack.length > 1) {
      this.undoStack.shift();
    }
  }
}
