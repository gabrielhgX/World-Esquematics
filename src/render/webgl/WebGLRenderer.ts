import type { Camera2D } from '../Camera2D';

/**
 * Renderer WebGL2 do fundo (README §6): raster é WebGL, vetor é Canvas 2D.
 *
 * Na Fase 0 limpa a tela (a "tela cinza" do entregável). As passadas de
 * terreno/hillshade/biomas/água entram nas Fases 1–2 como camadas deste
 * pipeline — só leem o WorldData, nunca escrevem (README §2).
 */
export class WebGLRenderer {
  private readonly gl: WebGL2RenderingContext;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      throw new Error('WebGL2 não está disponível neste navegador.');
    }
    this.gl = gl;
  }

  /** Dimensões em pixels FÍSICOS (já multiplicados pelo devicePixelRatio). */
  resize(widthPx: number, heightPx: number): void {
    this.gl.viewport(0, 0, widthPx, heightPx);
  }

  render(_camera: Camera2D): void {
    const gl = this.gl;
    gl.clearColor(0.15, 0.16, 0.18, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
}
