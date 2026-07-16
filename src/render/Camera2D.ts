/**
 * Câmera 2D do viewport: transformação tela ↔ mundo (README Fase 0, item 4).
 *
 * Espaço canônico D10: X = Leste, Y = Norte (para cima), destro. A tela
 * cresce para BAIXO, então `worldToScreen` inverte o eixo Y.
 *
 * Unidades: mundo em metros; tela em pixels CSS.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export class Camera2D {
  /** ponto do mundo (m) exibido no centro do viewport */
  center: Vec2 = { x: 0, y: 0 };

  minMetersPerPixel = 0.01;
  maxMetersPerPixel = 100_000;

  private _metersPerPixel = 1;
  private viewportWidth = 1;
  private viewportHeight = 1;

  get metersPerPixel(): number {
    return this._metersPerPixel;
  }

  setMetersPerPixel(mpp: number): void {
    this._metersPerPixel = Math.min(this.maxMetersPerPixel, Math.max(this.minMetersPerPixel, mpp));
  }

  setViewportSize(widthPx: number, heightPx: number): void {
    this.viewportWidth = Math.max(1, widthPx);
    this.viewportHeight = Math.max(1, heightPx);
  }

  get viewportSize(): { width: number; height: number } {
    return { width: this.viewportWidth, height: this.viewportHeight };
  }

  worldToScreen(p: Vec2): Vec2 {
    return {
      x: (p.x - this.center.x) / this._metersPerPixel + this.viewportWidth / 2,
      y: this.viewportHeight / 2 - (p.y - this.center.y) / this._metersPerPixel,
    };
  }

  screenToWorld(s: Vec2): Vec2 {
    return {
      x: this.center.x + (s.x - this.viewportWidth / 2) * this._metersPerPixel,
      y: this.center.y - (s.y - this.viewportHeight / 2) * this._metersPerPixel,
    };
  }

  /** Pan pela variação do ponteiro em px: o mundo acompanha o cursor. */
  panByPixels(dxPx: number, dyPx: number): void {
    this.center = {
      x: this.center.x - dxPx * this._metersPerPixel,
      y: this.center.y + dyPx * this._metersPerPixel,
    };
  }

  /** Zoom mantendo FIXO o ponto do mundo sob o cursor. `factor > 1` aproxima. */
  zoomAt(screenPt: Vec2, factor: number): void {
    const anchor = this.screenToWorld(screenPt);
    this.setMetersPerPixel(this._metersPerPixel / factor);
    this.center = {
      x: anchor.x - (screenPt.x - this.viewportWidth / 2) * this._metersPerPixel,
      y: anchor.y + (screenPt.y - this.viewportHeight / 2) * this._metersPerPixel,
    };
  }

  /** Enquadra a extensão do mundo inteira, com margem. */
  fitToExtent(extent: { width_m: number; height_m: number }, margin = 1.08): void {
    this.center = { x: extent.width_m / 2, y: extent.height_m / 2 };
    this.setMetersPerPixel(
      Math.max(extent.width_m / this.viewportWidth, extent.height_m / this.viewportHeight) * margin,
    );
  }
}
