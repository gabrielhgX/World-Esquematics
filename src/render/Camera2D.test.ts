import { describe, expect, it } from 'vitest';
import { Camera2D } from './Camera2D';

const makeCamera = () => {
  const camera = new Camera2D();
  camera.setViewportSize(800, 600);
  camera.center = { x: 1000, y: 2000 };
  camera.setMetersPerPixel(2);
  return camera;
};

describe('Camera2D — transformação tela ↔ mundo (README Fase 0)', () => {
  it('round-trip mundo → tela → mundo', () => {
    const camera = makeCamera();
    const p = { x: 1234.5, y: 1876.25 };
    const back = camera.screenToWorld(camera.worldToScreen(p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it('o centro do mundo cai no centro da tela', () => {
    const camera = makeCamera();
    expect(camera.worldToScreen({ x: 1000, y: 2000 })).toEqual({ x: 400, y: 300 });
  });

  it('eixo Y invertido: norte do centro aparece ACIMA na tela (D10)', () => {
    const camera = makeCamera();
    const north = camera.worldToScreen({ x: 1000, y: 2100 });
    expect(north.y).toBeLessThan(300);
  });

  it('panByPixels: o mundo acompanha o cursor', () => {
    const camera = makeCamera();
    const before = camera.screenToWorld({ x: 100, y: 100 });
    camera.panByPixels(50, 30); // ponto do mundo sob (100,100) vai para (150,130)
    const after = camera.screenToWorld({ x: 150, y: 130 });
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('zoomAt mantém fixo o ponto do mundo sob o cursor', () => {
    const camera = makeCamera();
    const cursor = { x: 200, y: 450 };
    const anchor = camera.screenToWorld(cursor);
    camera.zoomAt(cursor, 2);
    expect(camera.metersPerPixel).toBe(1);
    const after = camera.screenToWorld(cursor);
    expect(after.x).toBeCloseTo(anchor.x, 9);
    expect(after.y).toBeCloseTo(anchor.y, 9);
  });

  it('zoom respeita os limites de metersPerPixel', () => {
    const camera = makeCamera();
    camera.minMetersPerPixel = 0.5;
    camera.zoomAt({ x: 400, y: 300 }, 1e9);
    expect(camera.metersPerPixel).toBe(0.5);
  });

  it('fitToExtent centraliza e enquadra a extensão inteira', () => {
    const camera = makeCamera();
    camera.fitToExtent({ width_m: 16000, height_m: 16000 });
    expect(camera.center).toEqual({ x: 8000, y: 8000 });
    // extensão inteira visível: 16000 m / mpp ≤ menor lado do viewport
    expect(16000 / camera.metersPerPixel).toBeLessThanOrEqual(600);
  });
});
