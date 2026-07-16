import type { TiledRaster, WorldData, TileKey } from '../../core';
import type { Camera2D } from '../Camera2D';
import { TerrainRenderer } from './TerrainRenderer';

/**
 * Renderer WebGL2 do fundo (README §6): raster é WebGL, vetor é Canvas 2D.
 * Passadas atuais: 1. terreno (hillshade + rampa). Biomas e água entram nas
 * Fases 2 e 4 como novas passadas. SÓ LÊ o WorldData (README §2).
 */
export class WebGLRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly terrain: TerrainRenderer;

  constructor(canvas: HTMLCanvasElement, world: WorldData) {
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      throw new Error('WebGL2 não está disponível neste navegador.');
    }
    this.gl = gl;
    this.terrain = new TerrainRenderer(gl, world);
  }

  /** Dimensões em pixels FÍSICOS (já multiplicados pelo devicePixelRatio). */
  resize(widthPx: number, heightPx: number): void {
    this.gl.viewport(0, 0, widthPx, heightPx);
  }

  /** Reenvia à GPU somente os tiles sujos. */
  updateTiles(dirtyKeys: TileKey[]): void {
    if (dirtyKeys.length > 0) this.terrain.updateTiles(dirtyKeys);
  }

  /** Reenvia os tiles sujos do raster derivado de superfície d'água. */
  updateWaterTiles(dirtyKeys: TileKey[], waterRaster: TiledRaster<Uint16Array>): void {
    if (dirtyKeys.length > 0) this.terrain.updateWaterTiles(dirtyKeys, waterRaster);
  }

  /** Reenvia os tiles sujos do raster derivado de biomas + a paleta. */
  updateBiomeTiles(dirtyKeys: TileKey[], biomeRaster: TiledRaster<Uint8Array>): void {
    if (dirtyKeys.length > 0) this.terrain.updateBiomeTiles(dirtyKeys, biomeRaster);
  }

  updateBiomePalette(palette: WorldData['biomes']['palette']): void {
    this.terrain.updateBiomePalette(palette);
  }

  render(camera: Camera2D): void {
    const gl = this.gl;
    gl.clearColor(0.15, 0.16, 0.18, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.terrain.render(camera);
  }
}
