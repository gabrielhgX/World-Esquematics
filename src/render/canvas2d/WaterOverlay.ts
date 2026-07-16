import type { WorldData } from '../../core';
import type { Camera2D } from '../Camera2D';

/**
 * Vetores d'água no Canvas 2D (README §6): rios como splines com largura por
 * nó. Lagos e oceano não são desenhados aqui — a máscara por profundidade
 * derivada do shader cuida deles.
 */
export class WaterOverlay {
  constructor(private readonly world: WorldData) {}

  draw(ctx: CanvasRenderingContext2D, camera: Camera2D): void {
    const rivers = this.world.water.rivers;
    if (rivers.length === 0 || !this.world.water.visible) return;

    const mpp = camera.metersPerPixel;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(52, 110, 156, 0.85)';

    for (const river of rivers) {
      if (river.nodes.length < 2) continue;
      // largura varia por nó: um caminho por segmento, largura média
      for (let i = 1; i < river.nodes.length; i++) {
        const a = river.nodes[i - 1];
        const b = river.nodes[i];
        const sa = camera.worldToScreen(a);
        const sb = camera.worldToScreen(b);
        ctx.lineWidth = Math.max(1.25, (a.width_m + b.width_m) / 2 / mpp);
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
        ctx.stroke();
      }
    }
  }
}
