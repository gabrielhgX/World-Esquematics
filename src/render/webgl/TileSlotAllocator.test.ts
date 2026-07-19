import { describe, expect, it } from 'vitest';
import { TileSlotAllocator } from './TileSlotAllocator';

describe('TileSlotAllocator (P1-2) — empacota tiles vivos no atlas', () => {
  it('atribui slots em sequência e mapeia para (col,row) linha-a-linha', () => {
    const a = new TileSlotAllocator(2); // 2 colunas
    expect(a.acquire(10)).toEqual({ slot: 0, isNew: true });
    expect(a.acquire(11)).toEqual({ slot: 1, isNew: true });
    expect(a.acquire(12)).toEqual({ slot: 2, isNew: true });
    // re-acquire do mesmo tile devolve o mesmo slot, isNew=false
    expect(a.acquire(11)).toEqual({ slot: 1, isNew: false });

    expect([a.colOf(0), a.rowOf(0)]).toEqual([0, 0]);
    expect([a.colOf(1), a.rowOf(1)]).toEqual([1, 0]);
    expect([a.colOf(2), a.rowOf(2)]).toEqual([0, 1]); // desce para a linha 1
    expect(a.size).toBe(3);
  });

  it('linhas só crescem (marca-d’água) conforme os slots sobem', () => {
    const a = new TileSlotAllocator(2);
    expect(a.rows).toBe(0);
    a.acquire(0); // slot 0 → linha 0
    a.acquire(1); // slot 1 → linha 0
    expect(a.rows).toBe(1);
    a.acquire(2); // slot 2 → linha 1
    expect(a.rows).toBe(2);
    a.acquire(3); // slot 3 → linha 1
    expect(a.rows).toBe(2);
    a.acquire(4); // slot 4 → linha 2
    expect(a.rows).toBe(3);
  });

  it('reaproveita slot liberado antes de gastar um inédito; atlas não encolhe', () => {
    const a = new TileSlotAllocator(4);
    a.acquire(100); // 0
    a.acquire(101); // 1
    a.acquire(102); // 2
    expect(a.release(101)).toBe(1);
    expect(a.get(101)).toBeUndefined();
    expect(a.size).toBe(2);
    // o próximo acquire pega o slot 1 liberado, não o inédito 3
    expect(a.acquire(200)).toEqual({ slot: 1, isNew: true });
    // e um novo tile depois disso pega o inédito 3
    expect(a.acquire(201)).toEqual({ slot: 3, isNew: true });
  });

  it('release de tile inexistente é nulo; 1 coluna mínima', () => {
    const a = new TileSlotAllocator(1);
    expect(a.release(5)).toBeUndefined();
    a.acquire(5); // slot 0
    a.acquire(6); // slot 1 → com 1 coluna, cada slot é uma linha
    expect(a.rows).toBe(2);
    expect(() => new TileSlotAllocator(0)).toThrow();
  });
});
