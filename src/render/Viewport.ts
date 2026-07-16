import {
  BiomeRasterCache,
  ContourCache,
  WaterSurfaceCache,
  deriveGrid,
  type WorldData,
} from '../core';
import { Camera2D, type Vec2 } from './Camera2D';
import { WebGLRenderer } from './webgl/WebGLRenderer';
import { RulerOverlay } from './canvas2d/RulerOverlay';
import { ContourOverlay } from './canvas2d/ContourOverlay';
import { WaterOverlay } from './canvas2d/WaterOverlay';
import { VectorOverlay } from './canvas2d/VectorOverlay';
import { ObjectOverlay } from './canvas2d/ObjectOverlay';
import { ScatterTileCache } from './ScatterTileCache';
import type { Modifiers, Tool } from '../tools/Tool';

/**
 * Viewport (README §6): dois canvases empilhados —
 *  - WebGL (fundo): terreno com hillshade + rampa de cor;
 *  - Canvas 2D (frente): curvas de nível, réguas, overlay da ferramenta.
 *
 * SÓ LÊ o WorldData — escrita é papel exclusivo dos Commands (README §2).
 * É o consumidor único dos dirty tiles: a cada frame distribui para a GPU
 * (texSubImage parcial) e para o ContourCache (invalidação).
 *
 * Entrada: botão esquerdo = ferramenta ativa (ou pan, sem ferramenta);
 * botão do meio = pan sempre; roda = zoom no cursor.
 */
export class Viewport {
  readonly camera = new Camera2D();

  /** Notifica a posição do cursor em metros (null ao sair do viewport). */
  onCursorMove: ((worldPt: Vec2 | null) => void) | null = null;

  private activeTool: Tool | null = null;
  private toolStroking = false;

  private readonly glCanvas: HTMLCanvasElement;
  private readonly overlayCanvas: HTMLCanvasElement;
  private readonly overlayCtx: CanvasRenderingContext2D;
  private readonly renderer: WebGLRenderer;
  private readonly ruler = new RulerOverlay();
  private readonly contourCache: ContourCache;
  private readonly contours: ContourOverlay;
  private readonly waterCache: WaterSurfaceCache;
  private readonly waterOverlay: WaterOverlay;
  private readonly vectorOverlay: VectorOverlay;
  private readonly biomeCache: BiomeRasterCache;
  private readonly scatterCache: ScatterTileCache;
  private readonly objectOverlay: ObjectOverlay;
  private readonly resizeObserver: ResizeObserver;
  private readonly abort = new AbortController();

  private rafId: number | null = null;
  private panning = false;
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
    this.renderer = new WebGLRenderer(this.glCanvas, world);
    this.contourCache = new ContourCache(world.terrain, world.config.terrainResolution_m);
    this.contours = new ContourOverlay(world, this.contourCache);
    const grid = deriveGrid(world.config);
    this.waterCache = new WaterSurfaceCache(
      grid.widthCells,
      grid.heightCells,
      world.config.terrainResolution_m,
      world.config.heightRange,
    );
    this.waterOverlay = new WaterOverlay(world);
    this.vectorOverlay = new VectorOverlay(world);
    this.biomeCache = new BiomeRasterCache(
      grid.widthCells,
      grid.heightCells,
      world.config.terrainResolution_m,
    );
    this.scatterCache = new ScatterTileCache(world, this.biomeCache);
    this.objectOverlay = new ObjectOverlay(world, this.scatterCache);

    this.bindInput();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
    this.handleResize();
    this.updateCursorStyle();
  }

  setTool(tool: Tool | null): void {
    if (this.toolStroking) this.activeTool?.onPointerUp();
    this.toolStroking = false;
    this.activeTool = tool;
    this.updateCursorStyle();
    this.requestRender();
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

  /**
   * Thumbnail PNG do estado atual (README §8). Renderiza e captura no mesmo
   * task — o back buffer WebGL ainda é válido antes do compositor limpar.
   */
  captureThumbnailPng(maxSize = 256): Uint8Array | null {
    if (this.cssWidth === 0 || this.cssHeight === 0) return null;
    this.render();
    const scale = Math.min(maxSize / this.glCanvas.width, maxSize / this.glCanvas.height, 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(this.glCanvas.width * scale));
    canvas.height = Math.max(1, Math.round(this.glCanvas.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(this.glCanvas, 0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.overlayCanvas, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  private render(): void {
    // Consumidor único dos dirty tiles: GPU + caches derivados (README §2).
    const dirty = this.world.terrain.raster.consumeDirty();
    if (dirty.length > 0) {
      this.renderer.updateTiles(dirty);
      this.contourCache.invalidate(dirty);
      this.scatterCache.invalidate(dirty); // declividade mudou onde esculpiu
    }
    // superfície d'água derivada: sincroniza se a WaterLayer mudou de versão
    const dirtyWater = this.waterCache.sync(this.world.water);
    if (dirtyWater.length > 0) {
      this.renderer.updateWaterTiles(dirtyWater, this.waterCache.surfaceRaster);
    }
    // raster de biomas derivado (polígono fonte — §4.4) + paleta + scatter
    const dirtyBiome = this.biomeCache.sync(this.world.biomes);
    if (dirtyBiome.length > 0) {
      this.renderer.updateBiomeTiles(dirtyBiome, this.biomeCache.biomeRaster);
      this.renderer.updateBiomePalette(this.world.biomes.palette);
      this.scatterCache.clear();
    }

    this.renderer.render(this.camera);

    const ctx = this.overlayCtx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    this.contours.draw(ctx, this.camera);
    this.waterOverlay.draw(ctx, this.camera);
    // ordem do §6: estradas (5) → regiões (6) → objetos (7)
    this.vectorOverlay.draw(ctx, this.camera);
    this.objectOverlay.draw(ctx, this.camera);
    this.activeTool?.drawOverlay(ctx);
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
        const pt = this.toLocal(e);
        if (e.button === 0 && this.activeTool) {
          this.toolStroking = true;
          this.activeTool.onPointerDown(this.camera.screenToWorld(pt), toModifiers(e));
          el.setPointerCapture(e.pointerId);
          this.requestRender();
          return;
        }
        if (e.button === 0 || e.button === 1) {
          if (e.button === 1) e.preventDefault(); // sem autoscroll
          this.panning = true;
          this.lastPointer = pt;
          el.setPointerCapture(e.pointerId);
        }
      },
      { signal },
    );

    el.addEventListener(
      'pointermove',
      (e) => {
        const pt = this.toLocal(e);
        if (this.panning && this.lastPointer) {
          this.camera.panByPixels(pt.x - this.lastPointer.x, pt.y - this.lastPointer.y);
          this.lastPointer = pt;
        } else if (this.toolStroking && this.activeTool) {
          this.activeTool.onPointerMove(this.camera.screenToWorld(pt));
        } else if (this.activeTool) {
          // sem arrasto: ainda move o preview do pincel
          this.activeTool.onPointerMove(this.camera.screenToWorld(pt));
        }
        this.onCursorMove?.(this.camera.screenToWorld(pt));
        this.requestRender();
      },
      { signal },
    );

    const endInteraction = () => {
      if (this.toolStroking) this.activeTool?.onPointerUp();
      this.toolStroking = false;
      this.panning = false;
      this.lastPointer = null;
    };
    el.addEventListener('pointerup', endInteraction, { signal });
    el.addEventListener('pointercancel', endInteraction, { signal });
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

    // teclas para a ferramenta ativa (Enter conclui rio, Esc cancela…);
    // atalhos com Ctrl/Cmd (undo/redo) ficam com a aplicação
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (this.activeTool?.onKeyDown?.(e.key)) {
          e.preventDefault();
          this.requestRender();
        }
      },
      { signal },
    );
  }

  private updateCursorStyle(): void {
    this.container.style.cursor = this.activeTool?.cursor ?? 'grab';
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

function toModifiers(e: PointerEvent): Modifiers {
  return { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey };
}
