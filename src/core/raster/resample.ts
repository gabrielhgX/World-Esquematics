/**
 * Reamostragem BICÚBICA (Catmull-Rom) de grids uint16 (README §9.1, gotcha #1):
 * o Landscape da Unreal só aceita resoluções de uma tabela fixa, então o
 * exportador precisa reamostrar o grid para o tamanho válido mais próximo.
 *
 * Os cantos são preservados: pixel (0,0) ↔ (0,0) e (dstW−1) ↔ (srcW−1),
 * mantendo a extensão do mundo intacta.
 *
 * Borda: clamp-to-edge (padrão de reamostragem de imagens). No interior a
 * spline reproduz rampas lineares exatamente; na primeira/última célula a
 * vizinha duplicada suaviza levemente o gradiente — irrelevante para o
 * terreno e idêntico ao comportamento das engines.
 */
export function resampleBicubicU16(
  src: Uint16Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint16Array {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
    throw new RangeError('Dimensões de reamostragem devem ser positivas.');
  }
  if (src.length !== srcW * srcH) {
    throw new RangeError(`Fonte com ${src.length} valores; esperado ${srcW * srcH}.`);
  }

  const out = new Uint16Array(dstW * dstH);
  const scaleX = dstW > 1 ? (srcW - 1) / (dstW - 1) : 0;
  const scaleY = dstH > 1 ? (srcH - 1) / (dstH - 1) : 0;

  const clampX = (x: number) => Math.min(srcW - 1, Math.max(0, x));
  const clampY = (y: number) => Math.min(srcH - 1, Math.max(0, y));

  const rows = new Float64Array(4);
  for (let j = 0; j < dstH; j++) {
    const sy = j * scaleY;
    const y1 = Math.floor(sy);
    const ty = sy - y1;
    for (let i = 0; i < dstW; i++) {
      const sx = i * scaleX;
      const x1 = Math.floor(sx);
      const tx = sx - x1;

      for (let r = -1; r <= 2; r++) {
        const rowBase = clampY(y1 + r) * srcW;
        rows[r + 1] = catmullRom(
          src[rowBase + clampX(x1 - 1)],
          src[rowBase + clampX(x1)],
          src[rowBase + clampX(x1 + 1)],
          src[rowBase + clampX(x1 + 2)],
          tx,
        );
      }
      const value = catmullRom(rows[0], rows[1], rows[2], rows[3], ty);
      out[j * dstW + i] = Math.min(65535, Math.max(0, Math.round(value)));
    }
  }
  return out;
}

/** Spline de Catmull-Rom: reproduz funções lineares exatamente. */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
  );
}
