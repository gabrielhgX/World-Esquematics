import { TileSlotAllocator } from './TileSlotAllocator';

/**
 * Atlas de tiles na GPU (P1-2): guarda SÓ os tiles vivos, empacotados densos,
 * mais uma textura de indireção (page table) que diz em que slot cada tile
 * lógico mora — 0 = não alocado (o shader devolve o valor de preenchimento).
 *
 * Substitui a textura de grade cheia: um mapa esparso (a maior parte do
 * mundo intocado) passa a custar só os tiles que existem, e o atlas CRESCE em
 * linhas conforme o usuário esculpe, nunca além da grade cheia (que a
 * validação já garante caber no orçamento). Isolado aqui — o shader só ganha
 * um nível de indireção; a interface do renderer não muda.
 */

export interface TileAtlasOptions {
  gl: WebGL2RenderingContext;
  /** grade lógica em tiles */
  tilesX: number;
  tilesY: number;
  /** lado do tile em células (512) */
  tileSize: number;
  /** ex.: gl.R16UI / gl.R8UI */
  internalFormat: number;
  /** ex.: gl.RED_INTEGER */
  format: number;
  /** ex.: gl.UNSIGNED_SHORT / gl.UNSIGNED_BYTE */
  type: number;
  /** 2 para u16, 1 para u8 */
  unpackAlignment: number;
  maxTextureSize: number;
}

export class TileAtlas {
  private readonly gl: WebGL2RenderingContext;
  private readonly tilesX: number;
  private readonly tilesY: number;
  private readonly T: number;
  private readonly internalFormat: number;
  private readonly format: number;
  private readonly type: number;
  private readonly unpackAlignment: number;
  private readonly maxRows: number;

  private readonly allocator: TileSlotAllocator;
  /** page table (R16UI, tilesX×tilesY): slot+1 por tile, 0 = vazio */
  private readonly pageTex: WebGLTexture;
  private readonly pageData: Uint16Array;
  private atlasTex: WebGLTexture;
  private atlasRows: number;

  /** colunas de tiles no atlas (fixas: a posição de um slot nunca muda). */
  readonly cols: number;

  constructor(opts: TileAtlasOptions) {
    const gl = opts.gl;
    this.gl = gl;
    this.tilesX = opts.tilesX;
    this.tilesY = opts.tilesY;
    this.T = opts.tileSize;
    this.internalFormat = opts.internalFormat;
    this.format = opts.format;
    this.type = opts.type;
    this.unpackAlignment = opts.unpackAlignment;

    const maxTilesPerSide = Math.max(1, Math.floor(opts.maxTextureSize / this.T));
    this.cols = Math.max(1, Math.min(this.tilesX, maxTilesPerSide));
    this.maxRows = maxTilesPerSide;
    this.allocator = new TileSlotAllocator(this.cols);

    // page table zerada (tudo "não alocado" → preenchimento)
    this.pageData = new Uint16Array(this.tilesX * this.tilesY);
    this.pageTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.pageTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R16UI, this.tilesX, this.tilesY);
    setNearestClamp(gl);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 2);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      this.tilesX,
      this.tilesY,
      gl.RED_INTEGER,
      gl.UNSIGNED_SHORT,
      this.pageData,
    );

    // atlas começa com uma linha; cresce sob demanda
    this.atlasRows = 1;
    this.atlasTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, this.internalFormat, this.cols * this.T, this.atlasRows * this.T);
    setNearestClamp(gl);
  }

  /** Liga atlas e page table às unidades de textura dadas. */
  bind(atlasUnit: number, pageUnit: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + atlasUnit);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.activeTexture(gl.TEXTURE0 + pageUnit);
    gl.bindTexture(gl.TEXTURE_2D, this.pageTex);
  }

  /** Envia um tile T×T para o slot do tile (aloca um se preciso). */
  setTile(tx: number, ty: number, data: ArrayBufferView): void {
    if (tx < 0 || ty < 0 || tx >= this.tilesX || ty >= this.tilesY) return;
    const index = ty * this.tilesX + tx;
    const { slot, isNew } = this.allocator.acquire(index);
    this.ensureRows(this.allocator.rows);

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, this.unpackAlignment);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      this.allocator.colOf(slot) * this.T,
      this.allocator.rowOf(slot) * this.T,
      this.T,
      this.T,
      this.format,
      this.type,
      data,
    );

    if (isNew) {
      this.pageData[index] = slot + 1;
      this.uploadPageTexel(tx, ty);
    }
  }

  /** Marca o tile como não alocado (volta a ler o preenchimento). */
  clearTile(tx: number, ty: number): void {
    if (tx < 0 || ty < 0 || tx >= this.tilesX || ty >= this.tilesY) return;
    const index = ty * this.tilesX + tx;
    if (this.allocator.release(index) === undefined) return;
    this.pageData[index] = 0;
    this.uploadPageTexel(tx, ty);
  }

  private uploadPageTexel(tx: number, ty: number): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.pageTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 2);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      tx,
      ty,
      1,
      1,
      gl.RED_INTEGER,
      gl.UNSIGNED_SHORT,
      this.pageData.subarray(ty * this.tilesX + tx, ty * this.tilesX + tx + 1),
    );
  }

  /** Cresce o atlas em linhas (dobrando) preservando os slots já ocupados. */
  private ensureRows(neededRows: number): void {
    if (neededRows <= this.atlasRows) return;
    const gl = this.gl;
    const newRows = Math.min(this.maxRows, Math.max(neededRows, this.atlasRows * 2));

    const newTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, newTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, this.internalFormat, this.cols * this.T, newRows * this.T);
    setNearestClamp(gl);

    // copia o atlas antigo para o novo (mesma origem, mesmas colunas: os
    // slots mantêm a posição). Copiar na GPU dispensa reenviar os tiles.
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.READ_FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.atlasTex,
      0,
    );
    gl.bindTexture(gl.TEXTURE_2D, newTex);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, this.cols * this.T, this.atlasRows * this.T);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(this.atlasTex);

    this.atlasTex = newTex;
    this.atlasRows = newRows;
  }

  /** tiles vivos agora (para diagnóstico/estatística). */
  get liveTiles(): number {
    return this.allocator.size;
  }

  dispose(): void {
    this.gl.deleteTexture(this.atlasTex);
    this.gl.deleteTexture(this.pageTex);
  }
}

function setNearestClamp(gl: WebGL2RenderingContext): void {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
