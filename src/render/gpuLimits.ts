/**
 * Limite de textura da GPU (P1-3): o maior lado de textura que esta máquina
 * aceita. GPUs integradas/móveis reportam 4096 — abaixo do padrão de 4000²
 * do editor por pouca folga. Detectar ANTES de criar o projeto evita um
 * mundo que não abre (ou que não abriria noutra máquina).
 *
 * Sondado UMA vez num contexto WebGL2 descartável; se WebGL2 faltar,
 * devolve um piso conservador (4096) em vez de bloquear tudo.
 */

const CONSERVATIVE_FALLBACK = 4096;
let cached: number | null = null;

export function detectMaxTextureSize(): number {
  if (cached !== null) return cached;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    const size = gl?.getParameter(gl.MAX_TEXTURE_SIZE) as number | undefined;
    cached = typeof size === 'number' && size > 0 ? size : CONSERVATIVE_FALLBACK;
  } catch {
    cached = CONSERVATIVE_FALLBACK;
  }
  return cached;
}
