import type { WorldData } from '../../core';
import { parseTileKey, type TileKey } from '../../core';
import type { Camera2D } from '../Camera2D';
import { createProgram } from './glUtils';

/**
 * Passada de terreno (README §6/§6.1): o heightmap vive numa textura R16UI
 * (formato nativo uint16 — D3) e o hillshade + rampa de cor são puro
 * fragment shader, custo zero por edição. Tiles sujos viram texSubImage2D
 * parciais — nunca re-upload do mapa inteiro (D4).
 */

const VERTEX_SHADER = /* glsl */ `#version 300 es
in vec2 a_world;
uniform vec2 u_center;      // centro da câmera (m)
uniform float u_mpp;        // metros por pixel CSS
uniform vec2 u_viewport;    // viewport em pixels CSS
out vec2 v_world;
void main() {
  v_world = a_world;
  // Clip space Y cresce para cima, igual ao Norte do mundo (D10): sem flip.
  vec2 px = (a_world - u_center) / u_mpp;
  gl_Position = vec4(px / (u_viewport * 0.5), 0.0, 1.0);
}`;

const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp usampler2D;

uniform usampler2D u_height;  // R16UI
uniform vec2 u_grid;          // células (largura, altura)
uniform float u_res;          // metros por célula
uniform vec2 u_range;         // heightRange (min_m, max_m)

in vec2 v_world;
out vec4 outColor;

// Bilinear manual (texturas inteiras não filtram): 4 texelFetch + mix.
float heightAt(vec2 cell) {
  vec2 c = clamp(cell, vec2(0.0), u_grid - 1.0);
  vec2 f = floor(c);
  vec2 t = c - f;
  ivec2 i0 = ivec2(f);
  ivec2 i1 = min(i0 + 1, ivec2(u_grid) - 1);
  float h00 = float(texelFetch(u_height, i0, 0).r);
  float h10 = float(texelFetch(u_height, ivec2(i1.x, i0.y), 0).r);
  float h01 = float(texelFetch(u_height, ivec2(i0.x, i1.y), 0).r);
  float h11 = float(texelFetch(u_height, i1, 0).r);
  float u16 = mix(mix(h00, h10, t.x), mix(h01, h11, t.x), t.y);
  return u_range.x + (u16 / 65535.0) * (u_range.y - u_range.x);
}

// Rampa hipsométrica: batimetria abaixo de 0 m, verde → marrom → neve acima.
vec3 ramp(float h) {
  if (h < 0.0) {
    float b = clamp(h / min(u_range.x, -1.0), 0.0, 1.0);
    return mix(vec3(0.35, 0.42, 0.48), vec3(0.16, 0.22, 0.30), b);
  }
  float t = clamp(h / max(u_range.y, 1.0), 0.0, 1.0);
  vec3 c1 = vec3(0.32, 0.46, 0.26);
  vec3 c2 = vec3(0.55, 0.55, 0.32);
  vec3 c3 = vec3(0.52, 0.42, 0.30);
  vec3 c4 = vec3(0.62, 0.60, 0.58);
  vec3 c5 = vec3(0.93, 0.94, 0.95);
  if (t < 0.25) return mix(c1, c2, t / 0.25);
  if (t < 0.5) return mix(c2, c3, (t - 0.25) / 0.25);
  if (t < 0.75) return mix(c3, c4, (t - 0.5) / 0.25);
  return mix(c4, c5, (t - 0.75) / 0.25);
}

void main() {
  vec2 cell = v_world / u_res;
  float h = heightAt(cell);

  // Normal por gradiente central das vizinhas (README §4.2/§6.1).
  float hL = heightAt(cell + vec2(-1.0, 0.0));
  float hR = heightAt(cell + vec2(1.0, 0.0));
  float hD = heightAt(cell + vec2(0.0, -1.0));
  float hU = heightAt(cell + vec2(0.0, 1.0));
  vec3 n = normalize(vec3(-(hR - hL) / (2.0 * u_res), -(hU - hD) / (2.0 * u_res), 1.0));

  // Sol na convenção cartográfica: azimute 315° (noroeste), elevação 45°
  // (README §6.1) — com o sol vindo de outro lado, o cérebro inverte
  // montanhas e vales.
  vec3 sun = normalize(vec3(-0.5, 0.5, 0.7071));
  float lambert = max(dot(n, sun), 0.0);
  outColor = vec4(ramp(h) * (0.4 + 0.6 * lambert), 1.0);
}`;

export class TerrainRenderer {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly texture: WebGLTexture;
  private readonly uniforms: {
    center: WebGLUniformLocation | null;
    mpp: WebGLUniformLocation | null;
    viewport: WebGLUniformLocation | null;
    grid: WebGLUniformLocation | null;
    res: WebGLUniformLocation | null;
    range: WebGLUniformLocation | null;
  };
  /** buffer 512² reutilizado para regiões de tiles não alocados */
  private readonly baseTileData: Uint16Array;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly world: WorldData,
  ) {
    const raster = world.terrain.raster;
    const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    if (raster.widthCells > maxSize || raster.heightCells > maxSize) {
      throw new Error(
        `Grid de ${raster.widthCells}×${raster.heightCells} células excede o limite ` +
          `de textura desta GPU (${maxSize}). Aumente os metros por célula.`,
      );
    }

    this.program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.uniforms = {
      center: gl.getUniformLocation(this.program, 'u_center'),
      mpp: gl.getUniformLocation(this.program, 'u_mpp'),
      viewport: gl.getUniformLocation(this.program, 'u_viewport'),
      grid: gl.getUniformLocation(this.program, 'u_grid'),
      res: gl.getUniformLocation(this.program, 'u_res'),
      range: gl.getUniformLocation(this.program, 'u_range'),
    };

    // Quad da extensão do mundo em metros (triangle strip).
    const res = world.config.terrainResolution_m;
    const worldW = raster.widthCells * res;
    const worldH = raster.heightCells * res;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, worldW, 0, 0, worldH, worldW, worldH]),
      gl.STATIC_DRAW,
    );
    const aWorld = gl.getAttribLocation(this.program, 'a_world');
    gl.enableVertexAttribArray(aWorld);
    gl.vertexAttribPointer(aWorld, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Textura do heightmap: R16UI, sem filtro (bilinear é manual no shader).
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 2);
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R16UI, raster.widthCells, raster.heightCells);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.baseTileData = new Uint16Array(raster.tileSize * raster.tileSize).fill(raster.fillValue);
    for (let ty = 0; ty < raster.tilesY; ty++) {
      for (let tx = 0; tx < raster.tilesX; tx++) {
        this.uploadTile(tx, ty);
      }
    }
  }

  /** Reenvia só os tiles sujos (README §6.3: re-render após sculpt = só sujos). */
  updateTiles(dirtyKeys: TileKey[]): void {
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    for (const key of dirtyKeys) {
      const { tx, ty } = parseTileKey(key);
      this.uploadTile(tx, ty);
    }
  }

  render(camera: Camera2D): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    const raster = this.world.terrain.raster;
    const { width, height } = camera.viewportSize;
    gl.uniform2f(this.uniforms.center, camera.center.x, camera.center.y);
    gl.uniform1f(this.uniforms.mpp, camera.metersPerPixel);
    gl.uniform2f(this.uniforms.viewport, width, height);
    gl.uniform2f(this.uniforms.grid, raster.widthCells, raster.heightCells);
    gl.uniform1f(this.uniforms.res, this.world.config.terrainResolution_m);
    gl.uniform2f(
      this.uniforms.range,
      this.world.config.heightRange.min_m,
      this.world.config.heightRange.max_m,
    );

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  private uploadTile(tx: number, ty: number): void {
    const gl = this.gl;
    const raster = this.world.terrain.raster;
    const T = raster.tileSize;
    if (tx < 0 || ty < 0 || tx >= raster.tilesX || ty >= raster.tilesY) return;

    const x = tx * T;
    const y = ty * T;
    const w = Math.min(T, raster.widthCells - x);
    const h = Math.min(T, raster.heightCells - y);
    const data = raster.getTile(tx, ty) ?? this.baseTileData;

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    // O tile é 512 de largura; ROW_LENGTH permite subir região parcial na borda.
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, T);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RED_INTEGER, gl.UNSIGNED_SHORT, data);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
  }
}
