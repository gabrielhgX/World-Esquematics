import { describe, expect, it } from 'vitest';
import { formatMeters, formatRulerMeters } from './format';
import { niceStep } from './canvas2d/RulerOverlay';

describe('formatMeters (rótulos de régua/status)', () => {
  it('escolhe a unidade pela magnitude', () => {
    expect(formatMeters(0)).toBe('0 m');
    expect(formatMeters(500)).toBe('500 m');
    expect(formatMeters(1500)).toBe('1.5 km');
    expect(formatMeters(16000)).toBe('16 km');
    expect(formatMeters(0.4)).toBe('40 cm');
    expect(formatMeters(-2500)).toBe('-2.5 km');
  });
});

describe('formatRulerMeters (precisão vem do PASSO — bug do zoom máximo)', () => {
  it('zoom máximo perto de 4 km: vizinhos nunca colapsam no mesmo rótulo', () => {
    // antes: passo 1 m perto de 4 km imprimia "4 km" repetido em todo tick
    expect(formatRulerMeters(4001, 1)).toBe('4001 m');
    expect(formatRulerMeters(4002, 1)).toBe('4002 m');
    expect(formatRulerMeters(4001.2, 0.2)).toBe('4001.2 m');
  });

  it('a unidade vem do passo: régua inteira homogênea', () => {
    expect(formatRulerMeters(4000, 2000)).toBe('4 km');
    expect(formatRulerMeters(4100, 100)).toBe('4.1 km');
    expect(formatRulerMeters(3500, 20)).toBe('3500 m');
    expect(formatRulerMeters(0.4, 0.2)).toBe('0.4 m');
  });

  it('zero nunca vira "-0"', () => {
    expect(formatRulerMeters(-0.0001, 1)).toBe('0 m');
    expect(formatRulerMeters(-0.04, 0.5)).toBe('0.0 m');
  });
});

describe('niceStep (passos 1–2–5 da régua)', () => {
  it('arredonda para cima no próximo passo bonito', () => {
    expect(niceStep(1)).toBe(1);
    expect(niceStep(1.2)).toBe(2);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(120)).toBe(200);
    expect(niceStep(0.03)).toBe(0.05);
  });
});
