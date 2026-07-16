import { describe, expect, it } from 'vitest';
import type { Layer, LayerType } from './Layer';
import { LayerStack } from './LayerStack';

const makeLayer = (id: string, type: LayerType, order = 0): Layer => ({
  id,
  name: id,
  type,
  visible: true,
  locked: false,
  opacity: 1,
  order,
});

describe('LayerStack (README §4.1)', () => {
  it('terrain é singleton: segunda camada de relevo é rejeitada', () => {
    const stack = new LayerStack();
    stack.add(makeLayer('t1', 'terrain'));
    expect(() => stack.add(makeLayer('t2', 'terrain'))).toThrow(/singleton/);
  });

  it('demais tipos aceitam múltiplas instâncias', () => {
    const stack = new LayerStack();
    stack.add(makeLayer('vegetacao', 'object'));
    stack.add(makeLayer('construcoes', 'object'));
    expect(stack.getByType('object').length).toBe(2);
  });

  it('rejeita id duplicado', () => {
    const stack = new LayerStack();
    stack.add(makeLayer('a', 'poi'));
    expect(() => stack.add(makeLayer('a', 'region'))).toThrow(/duplicado/);
  });

  it('inOrder devolve cópia ordenada por order', () => {
    const stack = new LayerStack();
    stack.add(makeLayer('c', 'poi', 2));
    stack.add(makeLayer('a', 'region', 0));
    stack.add(makeLayer('b', 'water', 1));
    expect(stack.inOrder().map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('remove e getById', () => {
    const stack = new LayerStack();
    stack.add(makeLayer('a', 'poi'));
    expect(stack.getById('a')?.name).toBe('a');
    expect(stack.remove('a')).toBe(true);
    expect(stack.remove('a')).toBe(false);
    expect(stack.count).toBe(0);
  });
});
