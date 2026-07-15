import { describe, expect, it } from 'vitest';
import type { Command } from './Command';
import { History } from './History';
import { WorldData } from '../world/WorldData';
import { createWorldConfig } from '../world/WorldConfig';

const makeWorld = () =>
  new WorldData(
    createWorldConfig({
      projectName: 'Teste',
      extent: { width_m: 1000, height_m: 1000 },
      terrainResolution_m: 4,
      heightRange: { min_m: 0, max_m: 100 },
    }),
  );

/** Comando fake que registra apply/revert num log e sabe se fundir. */
function makeCommand(label: string, log: string[], memoryCost = 100): Command {
  return {
    label,
    memoryCost,
    apply: () => log.push(`+${label}`),
    revert: () => log.push(`-${label}`),
    mergeWith(next: Command): Command | null {
      return makeCommand(`${label}|${next.label}`, log, memoryCost + next.memoryCost);
    },
  };
}

describe('History (README §5.1)', () => {
  it('undo/redo na ordem correta', () => {
    const log: string[] = [];
    const world = makeWorld();
    const history = new History();
    history.push(makeCommand('a', log));
    history.push(makeCommand('b', log));

    expect(history.undo(world)?.label).toBe('b');
    expect(history.undo(world)?.label).toBe('a');
    expect(history.undo(world)).toBeNull();
    expect(history.redo(world)?.label).toBe('a');
    expect(log).toEqual(['-b', '-a', '+a']);
  });

  it('novo comando limpa a pilha de redo', () => {
    const log: string[] = [];
    const world = makeWorld();
    const history = new History();
    history.push(makeCommand('a', log));
    history.undo(world);
    history.push(makeCommand('b', log));
    expect(history.canRedo).toBe(false);
  });

  it('coalescência: um traço com N eventos vira UM comando', () => {
    const log: string[] = [];
    const history = new History();
    history.push(makeCommand('s1', log), true);
    history.push(makeCommand('s2', log), true);
    history.push(makeCommand('s3', log), true);
    expect(history.undoCount).toBe(1);
  });

  it('sealTop fecha o traço: o próximo comando não funde', () => {
    const log: string[] = [];
    const history = new History();
    history.push(makeCommand('s1', log), true);
    history.sealTop();
    history.push(makeCommand('s2', log), true);
    expect(history.undoCount).toBe(2);
  });

  it('push sem coalesce nunca funde, mesmo com mergeWith disponível', () => {
    const log: string[] = [];
    const history = new History();
    history.push(makeCommand('a', log), true);
    history.push(makeCommand('b', log), false);
    expect(history.undoCount).toBe(2);
  });

  it('orçamento em bytes descarta os comandos mais antigos', () => {
    const log: string[] = [];
    const history = new History(250); // cabem 2 comandos de 100 bytes
    history.push(makeCommand('a', log));
    history.push(makeCommand('b', log));
    history.push(makeCommand('c', log));
    expect(history.undoCount).toBe(2);
    expect(history.usedBytes).toBe(200);

    const world = makeWorld();
    expect(history.undo(world)?.label).toBe('c');
    expect(history.undo(world)?.label).toBe('b');
    expect(history.undo(world)).toBeNull(); // "a" foi descartado
  });

  it('mantém ao menos o último comando mesmo acima do orçamento', () => {
    const log: string[] = [];
    const history = new History(10);
    history.push(makeCommand('gigante', log, 999));
    expect(history.undoCount).toBe(1);
  });
});
