import { describe, expect, it } from 'vitest';
import type { Command } from './Command';
import { CommandBus } from './CommandBus';
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

function makeCommand(label: string, log: string[]): Command {
  return {
    label,
    memoryCost: 10,
    apply: () => log.push(`+${label}`),
    revert: () => log.push(`-${label}`),
  };
}

describe('CommandBus — única porta de escrita (README §2, D7)', () => {
  it('execute aplica ao mundo, empilha no histórico e emite evento', () => {
    const log: string[] = [];
    const events: string[] = [];
    const bus = new CommandBus(makeWorld(), new History());
    bus.events.on('executed', ({ command }) => events.push(command.label));

    bus.execute(makeCommand('a', log));

    expect(log).toEqual(['+a']);
    expect(bus.history.canUndo).toBe(true);
    expect(events).toEqual(['a']);
  });

  it('undo/redo revertem/reaplicam e emitem eventos', () => {
    const log: string[] = [];
    const events: string[] = [];
    const bus = new CommandBus(makeWorld(), new History());
    bus.events.on('undone', ({ command }) => events.push(`undo:${command.label}`));
    bus.events.on('redone', ({ command }) => events.push(`redo:${command.label}`));

    bus.execute(makeCommand('a', log));
    expect(bus.undo()).toBe(true);
    expect(bus.redo()).toBe(true);
    expect(bus.undo()).toBe(true);
    expect(bus.undo()).toBe(false); // pilha vazia: sem evento

    expect(log).toEqual(['+a', '-a', '+a', '-a']);
    expect(events).toEqual(['undo:a', 'redo:a', 'undo:a']);
  });

  it('sealCoalescing fecha o traço atual (mouseup)', () => {
    const log: string[] = [];
    const bus = new CommandBus(makeWorld(), new History());
    const mergeable = (label: string): Command => ({
      label,
      memoryCost: 10,
      apply: () => log.push(`+${label}`),
      revert: () => log.push(`-${label}`),
      mergeWith: (next) => mergeable(`${label}|${next.label}`),
    });

    bus.execute(mergeable('s1'), { coalesce: true });
    bus.execute(mergeable('s2'), { coalesce: true });
    bus.sealCoalescing();
    bus.execute(mergeable('s3'), { coalesce: true });

    expect(bus.history.undoCount).toBe(2); // (s1|s2) e (s3)
  });
});
