import { describe, expect, it } from 'vitest';
import {
  ALTITUDE_LENS,
  altitudeColorAt,
  FINAL_LENS,
  getLens,
  LENSES,
  SLOPE_LENS,
  slopeColorAt,
} from './lenses';

const RANGE = { min_m: -200, max_m: 1800 };

describe('lentes de visualização (só exibição — nunca dados)', () => {
  it('registro: final é o padrão; ids desconhecidos caem no final', () => {
    expect(LENSES[0]).toBe(FINAL_LENS);
    expect(getLens('altitude')).toBe(ALTITUDE_LENS);
    expect(getLens('nao-existe')).toBe(FINAL_LENS);
  });

  it('lente Altitude: escala pedida — verde no 0, marrom no topo, azul submerso', () => {
    const [r0, g0, b0] = altitudeColorAt(0, RANGE);
    expect(g0).toBeGreaterThan(r0); // verde
    expect(g0).toBeGreaterThan(b0);

    const top = altitudeColorAt(RANGE.max_m, RANGE);
    expect(top).toEqual([62, 39, 35]); // marrom escuro no topo

    const [rs, gs, bs] = altitudeColorAt(-1, RANGE); // início do submerso
    expect(bs).toBeGreaterThan(rs);
    expect(bs).toBeGreaterThan(gs);
    const deep = altitudeColorAt(RANGE.min_m, RANGE);
    expect(deep[2]).toBeLessThan(bs); // fundo escurece

    // ordem pedida acima do 0: amarelo → vermelho → laranja → marrom
    const yellow = altitudeColorAt(0.15 * RANGE.max_m, RANGE);
    const red = altitudeColorAt(0.35 * RANGE.max_m, RANGE);
    expect(yellow[1]).toBeGreaterThan(red[1]); // amarelo tem mais verde
    expect(red[0]).toBeGreaterThan(red[1]); // vermelho domina o canal R
  });

  it('rampa da lente cobre o range inteiro em 256 entradas RGBA', () => {
    const ramp = ALTITUDE_LENS.buildRamp!(RANGE);
    expect(ramp.length).toBe(256 * 4);
    // índice 0 = min (azul profundo); 255 = max (marrom escuro)
    expect(ramp[2]).toBeGreaterThan(ramp[0]);
    expect([ramp[255 * 4], ramp[255 * 4 + 1], ramp[255 * 4 + 2]]).toEqual([62, 39, 35]);
    for (let i = 0; i < 256; i++) expect(ramp[i * 4 + 3]).toBe(255);
  });

  it('Altitude: sombra fraca, sem água/biomas; Final mostra tudo pleno', () => {
    expect(ALTITUDE_LENS.hillshade).toBeGreaterThan(0); // P0-6: altitude COM forma
    expect(ALTITUDE_LENS.hillshade).toBeLessThan(1);
    expect(ALTITUDE_LENS.showWater).toBe(false);
    expect(ALTITUDE_LENS.overlays.vectors).toBe(false);
    expect(FINAL_LENS.hillshade).toBe(1);
    expect(FINAL_LENS.overlays.vectors).toBe(true);
  });

  it('as duas lentes esticam para o relevo REAL (rangeSource data — P0-4)', () => {
    expect(FINAL_LENS.rangeSource).toBe('data');
    expect(ALTITUDE_LENS.rangeSource).toBe('data');
  });

  it('lente Declividade (P3-1): verde plano → amarelo → vermelho íngreme', () => {
    expect(getLens('slope')).toBe(SLOPE_LENS);
    expect(SLOPE_LENS.slope).toBe(true);

    const [rg, gg, bg] = slopeColorAt(0); // plano: verde
    expect(gg).toBeGreaterThan(rg);
    expect(gg).toBeGreaterThan(bg);
    expect(slopeColorAt(3)).toEqual(slopeColorAt(0)); // ≤5% tudo verde

    const [ry, gy] = slopeColorAt(10); // meio: amarelado (R e G altos, iguais-ish)
    expect(ry).toBeGreaterThan(150);
    expect(gy).toBeGreaterThan(150);

    const [rr, gr] = slopeColorAt(25); // íngreme: vermelho satura
    expect(rr).toBeGreaterThan(gr);
    expect(slopeColorAt(25)).toEqual(slopeColorAt(15.001)); // >15% tudo vermelho

    // monotônico no canal vermelho conforme fica mais íngreme
    expect(slopeColorAt(2)[0]).toBeLessThan(slopeColorAt(12)[0]);
  });

  it('Declividade: sem água/biomas, estradas visíveis (comparar traçado × grade)', () => {
    expect(SLOPE_LENS.showWater).toBe(false);
    expect(SLOPE_LENS.showBiomes).toBe(false);
    expect(SLOPE_LENS.overlays.vectors).toBe(true);
    expect(SLOPE_LENS.overlays.contours).toBe(false);
  });
});
