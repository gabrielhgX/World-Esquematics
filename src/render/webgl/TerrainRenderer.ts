import type { BiomeDefinition, TiledRaster, WorldData } from '../../core';
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
uniform usampler2D u_water;   // R16UI: cota u16 da superfície dos lagos, 0 = sem água
uniform usampler2D u_biome;   // R8UI: id do bioma por célula, 0 = sem bioma
uniform sampler2D u_palette;  // 256×1: cor de cada id de bioma
uniform vec2 u_grid;          // células (largura, altura)
uniform float u_res;          // metros por célula
uniform vec2 u_range;         // heightRange (min_m, max_m)
uniform float u_seaLevel;     // cota do oceano global (m)

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
  vec3 color = ramp(h) * (0.4 + 0.6 * lambert);

  // Biomas: paleta indexada com blend (README §6, passada 2).
  ivec2 biomeIdx = ivec2(clamp(cell, vec2(0.0), u_grid - 1.0));
  uint biomeId = texelFetch(u_biome, biomeIdx, 0).r;
  if (biomeId > 0u) {
    vec3 biomeColor = texelFetch(u_palette, ivec2(int(biomeId), 0), 0).rgb;
    color = mix(color, biomeColor * (0.5 + 0.5 * lambert), 0.45);
  }

  // Água por PROFUNDIDADE DERIVADA (README §4.3/§6, D8):
  // depth = surface − height, no shader. depth ≤ 0 → terra seca — a margem
  // se resolve sozinha; esculpir o relevo move a margem automaticamente.
  ivec2 cellIdx = ivec2(clamp(cell, vec2(0.0), u_grid - 1.0));
  float lakeU16 = float(texelFetch(u_water, cellIdx, 0).r);
  float surface_m = u_seaLevel;
  if (lakeU16 > 0.5) {
    surface_m = max(surface_m, u_range.x + (lakeU16 / 65535.0) * (u_range.y - u_range.x));
  }
  float depth = surface_m - h;
  if (depth > 0.0) {
    vec3 shallow = vec3(0.32, 0.55, 0.62);
    vec3 deep = vec3(0.07, 0.20, 0.36);
    vec3 water = mix(shallow, deep, clamp(depth / 40.0, 0.0, 1.0));
    float shore = clamp(depth / 1.5, 0.0, 1.0); // transição suave na margem
    color = mix(color, water * (0.7 + 0.3 * lambert), 0.35 + 0.6 * shore);
  }

  outColor = vec4(color, 1.0);
}`;

export class TerrainRenderer {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly texture: WebGLTexture;
  private readonly waterTexture: WebGLTexture;
  private readonly uniforms: {
    center: WebGLUniformLocation | null;
    mpp: WebGLUniformLocation | null;
    viewport: WebGLUniformLocation | null;
    grid: WebGLUniformLocation | null;
    res: WebGLUniformLocation | null;
    range: WebGLUniformLocation | null;
    seaLevel: WebGLUniformLocation | null;
  };
  private readonly biomeTexture: WebGLTexture;
  private readonly paletteTexture: WebGLTexture;
  /** buffer 512² reutilizado para regiões de tiles não alocados */
  private readonly baseTileData: Uint16Array;
  /** idem, zerado, para tiles d'água desalocados (0 = sem água) */
  private readonly zeroTileData: Uint16Array;
  private readonly zeroTileDataU8: Uint8Array;

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
      seaLevel: gl.getUniformLocation(this.program, 'u_seaLevel'),
    };
    // unidades de textura fixas: 0 = relevo, 1 = água, 2 = biomas, 3 = paleta
    gl.useProgram(this.program);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_height'), 0);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_water'), 1);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_biome'), 2);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_palette'), 3);

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

    // Textura da superfície d'água (mesma grade), inicia sem água (zeros).
    this.zeroTileData = new Uint16Array(raster.tileSize * raster.tileSize);
    this.waterTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.waterTexture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R16UI, raster.widthCells, raster.heightCells);
    setNearestClamp(gl);
    for (let ty = 0; ty < raster.tilesY; ty++) {
      for (let tx = 0; tx < raster.tilesX; tx++) {
        this.uploadRegion(this.waterTexture, tx, ty, this.zeroTileData);
      }
    }

    // Textura de biomas (R8UI, mesma grade) + paleta indexada 256×1 (§4.4/§6).
    this.zeroTileDataU8 = new Uint8Array(raster.tileSize * raster.tileSize);
    this.biomeTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.biomeTexture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8UI, raster.widthCells, raster.heightCells);
    setNearestClamp(gl);
    for (let ty = 0; ty < raster.tilesY; ty++) {
      for (let tx = 0; tx < raster.tilesX; tx++) {
        this.uploadRegionU8(this.biomeTexture, tx, ty, this.zeroTileDataU8);
      }
    }
    this.paletteTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 256, 1);
    setNearestClamp(gl);
    this.updateBiomePalette(world.biomes.palette);
  }

  /** Reenvia a paleta de cores dos biomas (id → cor). */
  updateBiomePalette(palette: readonly BiomeDefinition[]): void {
    const gl = this.gl;
    const data = new Uint8Array(256 * 4);
    for (const biome of palette) {
      if (biome.id < 0 || biome.id > 255) continue;
      const hex = biome.color.replace('#', '');
      data[biome.id * 4] = parseInt(hex.slice(0, 2), 16);
      data[biome.id * 4 + 1] = parseInt(hex.slice(2, 4), 16);
      data[biome.id * 4 + 2] = parseInt(hex.slice(4, 6), 16);
      data[biome.id * 4 + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 2);
  }

  /** Reenvia tiles sujos do raster DERIVADO de biomas. */
  updateBiomeTiles(dirtyKeys: TileKey[], biomeRaster: TiledRaster<Uint8Array>): void {
    const raster = this.world.terrain.raster;
    for (const key of dirtyKeys) {
      const { tx, ty } = parseTileKey(key);
      if (tx < 0 || ty < 0 || tx >= raster.tilesX || ty >= raster.tilesY) continue;
      this.uploadRegionU8(
        this.biomeTexture,
        tx,
        ty,
        biomeRaster.getTile(tx, ty) ?? this.zeroTileDataU8,
      );
    }
  }

  /** Reenvia só os tiles sujos (README §6.3: re-render após sculpt = só sujos). */
  updateTiles(dirtyKeys: TileKey[]): void {
    for (const key of dirtyKeys) {
      const { tx, ty } = parseTileKey(key);
      this.uploadTile(tx, ty);
    }
  }

  /** Reenvia tiles sujos do raster DERIVADO de superfície d'água. */
  updateWaterTiles(dirtyKeys: TileKey[], waterRaster: TiledRaster<Uint16Array>): void {
    const raster = this.world.terrain.raster;
    for (const key of dirtyKeys) {
      const { tx, ty } = parseTileKey(key);
      if (tx < 0 || ty < 0 || tx >= raster.tilesX || ty >= raster.tilesY) continue;
      this.uploadRegion(
        this.waterTexture,
        tx,
        ty,
        waterRaster.getTile(tx, ty) ?? this.zeroTileData,
      );
    }
  }

  render(camera: Camera2D): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.waterTexture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.biomeTexture);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);

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
    // mudar a cota do mar reflete instantaneamente — é só o shader (§7.2)
    gl.uniform1f(this.uniforms.seaLevel, this.world.water.seaLevel_m);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
  }

  private uploadTile(tx: number, ty: number): void {
    const raster = this.world.terrain.raster;
    if (tx < 0 || ty < 0 || tx >= raster.tilesX || ty >= raster.tilesY) return;
    this.uploadRegion(this.texture, tx, ty, raster.getTile(tx, ty) ?? this.baseTileData);
  }

  /** Sobe um tile (ou região parcial, na borda) para a textura dada. */
  private uploadRegion(texture: WebGLTexture, tx: number, ty: number, data: Uint16Array): void {
    const gl = this.gl;
    const raster = this.world.terrain.raster;
    const T = raster.tileSize;
    const x = tx * T;
    const y = ty * T;
    const w = Math.min(T, raster.widthCells - x);
    const h = Math.min(T, raster.heightCells - y);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    // O tile é 512 de largura; ROW_LENGTH permite subir região parcial na borda.
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, T);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RED_INTEGER, gl.UNSIGNED_SHORT, data);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
  }

  /** Idem, para tiles uint8 (raster de biomas). */
  private uploadRegionU8(texture: WebGLTexture, tx: number, ty: number, data: Uint8Array): void {
    const gl = this.gl;
    const raster = this.world.terrain.raster;
    const T = raster.tileSize;
    const x = tx * T;
    const y = ty * T;
    const w = Math.min(T, raster.widthCells - x);
    const h = Math.min(T, raster.heightCells - y);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, T);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RED_INTEGER, gl.UNSIGNED_BYTE, data);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 2);
  }
}

function setNearestClamp(gl: WebGL2RenderingContext): void {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
