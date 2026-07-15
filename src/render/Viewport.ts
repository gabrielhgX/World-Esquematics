import type { WorldData } from '../core';
import { Camera2D, type Vec2 } from './Camera2D';
import { WebGLRenderer } from './webgl/WebGLRenderer';
import { RulerOverlay } from './canvas2d/RulerOverlay';

/**
 * Viewport (README §6): dois canvases empilhados —
 *  - WebGL (fundo): raster (terreno/biomas/água nas próximas fases);
 *  - Canvas 2D (frente): vetores e overlays (réguas, futuramente curvas,
 *    estradas, gizmos).
 *
 * SÓ LÊ o WorldData — escrita é papel exclusivo dos Commands (README §2).
 * Entrada da Fase 0: arrastar = pan; roda do mouse = zoom no cursor.
 */
export class Viewport {
  readonly camera = new Camera2D();

  /** Notifica a posição do cursor em metros (null ao sair do viewport). */
  onCursorMove: ((worldPt: Vec2 | null) => void) | null = null;

  private readonly glCanvas: HTMLCanvasElement;
  private readonly overlayCanvas: HTMLCanvasElement;
  private readonly overlayCtx: CanvasRenderingContext2D;
  private readonly renderer: WebGLRenderer;
  private readonly ruler = new RulerOverlay();
  private readonly resizeObserver: ResizeObserver;
  private readonly abort = new AbortController();

  private rafId: number | null = null;
  private dragging = false;
  private lastPointer: Vec2 | null = null;
  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;
  private hasFitted = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly world: WorldData,
  ) {
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.touchAction = 'none';

    this.glCanvas = this.createLayerCanvas('0');
    this.overlayCanvas = this.createLayerCanvas('1');
    this.overlayCanvas.style.pointerEvents = 'none';
    container.append(this.glCanvas, this.overlayCanvas);

    const ctx = this.overlayCanvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D não está disponível.');
    this.overlayCtx = ctx;
    this.renderer = new WebGLRenderer(this.glCanvas);

    this.bindInput();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
    this.handleResize();
  }

  /** Agenda um único render no próximo frame (coalescido via rAF). */
  requestRender(): void {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.render();
    });
  }

  dispose(): void {
    this.abort.abort();
    this.resizeObserver.disconnect();
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.glCanvas.remove();
    this.overlayCanvas.remove();
  }

  private render(): void {
    this.renderer.render(this.camera);
    const ctx = this.overlayCtx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    this.ruler.draw(ctx, this.camera, this.cssWidth, this.cssHeight);
  }

  private handleResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    this.cssWidth = width;
    this.cssHeight = height;
    this.dpr = window.devicePixelRatio || 1;
    for (const canvas of [this.glCanvas, this.overlayCanvas]) {
      canvas.width = Math.round(width * this.dpr);
      canvas.height = Math.round(height * this.dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    this.camera.setViewportSize(width, height);
    this.renderer.resize(this.glCanvas.width, this.glCanvas.height);

    if (!this.hasFitted) {
      this.camera.fitToExtent(this.world.config.extent);
      this.hasFitted = true;
    }
    this.requestRender();
  }

  private bindInput(): void {
    const signal = this.abort.signal;
    const el = this.container;

    el.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0 && e.button !== 1) return;
        this.dragging = true;
        this.lastPointer = this.toLocal(e);
        el.setPointerCapture(e.pointerId);
      },
      { signal },
    );

    el.addEventListener(
      'pointermove',
      (e) => {
        const pt = this.toLocal(e);
        if (this.dragging && this.lastPointer) {
          this.camera.panByPixels(pt.x - this.lastPointer.x, pt.y - this.lastPointer.y);
          this.lastPointer = pt;
          this.requestRender();
        }
        this.onCursorMove?.(this.camera.screenToWorld(pt));
      },
      { signal },
    );

    const endDrag = () => {
      this.dragging = false;
      this.lastPointer = null;
    };
    el.addEventListener('pointerup', endDrag, { signal });
    el.addEventListener('pointercancel', endDrag, { signal });
    el.addEventListener('pointerleave', () => this.onCursorMove?.(null), { signal });

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const factor = Math.pow(1.0015, -e.deltaY);
        this.camera.zoomAt(this.toLocal(e), factor);
        this.requestRender();
      },
      { passive: false, signal },
    );
  }

  private toLocal(e: PointerEvent | WheelEvent): Vec2 {
    const rect = this.container.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private createLayerCanvas(zIndex: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.zIndex = zIndex;
    return canvas;
  }
}
