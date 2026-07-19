/**
 * Alocador de slots do atlas de tiles (P1-2). Puro — sem GL, testável em nó.
 *
 * A GPU não é esparsa como o TiledRaster (D4): as texturas de grade cheia
 * reservam a VRAM do mapa inteiro mesmo com poucos tiles vivos. O atlas guarda
 * SÓ os tiles alocados, empacotados densamente; este alocador decide em qual
 * slot cada tile mora e reaproveita os slots liberados. Os slots são
 * atribuídos em ordem linha-a-linha com `cols` colunas fixas, então a posição
 * de um slot nunca muda — o atlas só CRESCE em linhas, preservando o que já
 * está lá.
 */
export class TileSlotAllocator {
  private readonly slots = new Map<number, number>();
  private readonly freed: number[] = [];
  /** próximo slot inédito (marca-d'água) */
  private high = 0;
  /** linhas necessárias para conter todos os slots já usados (só cresce) */
  private rowsUsed = 0;

  constructor(readonly cols: number) {
    if (cols < 1) throw new Error('atlas precisa de ao menos 1 coluna');
  }

  /** slot atual do tile, ou undefined se não alocado. */
  get(tileIndex: number): number | undefined {
    return this.slots.get(tileIndex);
  }

  /**
   * Garante um slot para o tile (reusa o do próprio tile, senão um liberado,
   * senão um inédito). isNew=false quando o tile já tinha slot.
   */
  acquire(tileIndex: number): { slot: number; isNew: boolean } {
    const existing = this.slots.get(tileIndex);
    if (existing !== undefined) return { slot: existing, isNew: false };
    const slot = this.freed.length > 0 ? (this.freed.pop() as number) : this.high++;
    this.slots.set(tileIndex, slot);
    this.rowsUsed = Math.max(this.rowsUsed, Math.floor(slot / this.cols) + 1);
    return { slot, isNew: true };
  }

  /** Libera o slot do tile (volta para reuso); devolve o slot ou undefined. */
  release(tileIndex: number): number | undefined {
    const slot = this.slots.get(tileIndex);
    if (slot === undefined) return undefined;
    this.slots.delete(tileIndex);
    this.freed.push(slot);
    return slot;
  }

  colOf(slot: number): number {
    return slot % this.cols;
  }

  rowOf(slot: number): number {
    return Math.floor(slot / this.cols);
  }

  /** linhas necessárias para conter tudo que já foi alocado (marca-d'água). */
  get rows(): number {
    return this.rowsUsed;
  }

  /** tiles vivos agora. */
  get size(): number {
    return this.slots.size;
  }
}
