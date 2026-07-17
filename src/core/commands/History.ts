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
  /** total CORRENTE das duas pilhas — somado/subtraído nas mutações (P1-1):
   * recalcular por varredura a cada push era O(n²) no caminho quente. */
  private totalBytes = 0;

  constructor(readonly budgetBytes: number = DEFAULT_HISTORY_BUDGET_BYTES) {}

  /**
   * Empilha um comando JÁ APLICADO ao mundo (quem aplica é o CommandBus).
   * Com `coalesce = true`, tenta fundir com o comando aberto no topo via
   * `mergeWith`; o traço é fechado por `sealTop()` (mouseup).
   */
  push(command: Command, coalesce = false): void {
    for (const dropped of this.redoStack) this.totalBytes -= dropped.memoryCost;
    this.redoStack = [];
    const top = this.undoStack[this.undoStack.length - 1];
    if (coalesce && top?.open && top.command.mergeWith) {
      const costBeforeMerge = top.command.memoryCost;
      const merged = top.command.mergeWith(command);
      if (merged) {
        top.command = merged;
        this.totalBytes += merged.memoryCost - costBeforeMerge;
        this.enforceBudget();
        return;
      }
    }
    this.undoStack.push({ command, open: coalesce });
    this.totalBytes += command.memoryCost;
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

  /** Soma dos custos declarados pelos comandos das duas pilhas (O(1)). */
  get usedBytes(): number {
    return this.totalBytes;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack = [];
    this.totalBytes = 0;
  }

  /** Descarta os mais antigos até caber no orçamento (mantém ao menos o último). */
  private enforceBudget(): void {
    while (this.totalBytes > this.budgetBytes && this.undoStack.length > 1) {
      const dropped = this.undoStack.shift();
      if (dropped) this.totalBytes -= dropped.command.memoryCost;
    }
  }
}
