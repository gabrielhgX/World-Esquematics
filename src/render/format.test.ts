import { describe, expect, it } from 'vitest';
import { formatMeters } from './format';
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
