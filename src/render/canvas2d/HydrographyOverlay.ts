import { traceFlowNetwork, type FlowNetworkResult, type WorldData } from '../../core';
import type { Camera2D } from '../Camera2D';
import { flowColorAt } from '../lenses/lenses';

/**
 * Lente de Hidrografia (P3-2): desenha a REDE DE DRENAGEM natural do relevo —
 * os talvegues por onde a água escoaria. É a mesma matemática D8 de "Sugerir
 * rios", mas só leitura: mostra o fluxo, não cria água nenhuma.
 *
 * A rede é cara de recalcular (D8 num grid reduzido), então é cache
 * invalidável — igual ao ContourCache: recomputa só quando o relevo muda
 * (Viewport chama invalidate ao consumir dirty tiles), nunca ao pan/zoom.
 */
export class HydrographyOverlay {
  private network: FlowNetworkResult | null = null;
  private dirty = true;

  constructor(
    private readonly world: WorldData,
    private readonly resolution_m: number,
  ) {}

  /** O relevo mudou: recomputa a rede no próximo desenho. */
  invalidate(): void {
    this.dirty = true;
  }

  private ensureNetwork(): FlowNetworkResult {
    if (this.dirty || !this.network) {
      this.network = traceFlowNetwork(this.world.terrain, this.resolution_m);
      this.dirty = false;
    }
    return this.network;
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera2D): void {
    const { channels, maxAccumulation } = this.ensureNetwork();
    if (channels.length === 0) return;

    // escala log: a acumulação é muito enviesada (a foz drena a bacia inteira)
    const logMax = Math.log(maxAccumulation + 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const channel of channels) {
      const { points, accumulation } = channel;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const sa = camera.worldToScreen({ x: a[0], y: a[1] });
        const sb = camera.worldToScreen({ x: b[0], y: b[1] });
        // fluxo do segmento → cor (córrego→rio) e largura crescem juntos
        const acc = (accumulation[i - 1] + accumulation[i]) / 2;
        const t = logMax > 0 ? Math.log(acc + 1) / logMax : 0;
        const width = 1.5 + 4.5 * t;
        // halo escuro: o traçado precisa ler tanto no cume claro quanto no
        // vale escuro do hillshade (técnica cartográfica padrão)
        ctx.strokeStyle = 'rgba(8, 24, 48, 0.5)';
        ctx.lineWidth = width + 2;
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
        ctx.stroke();
        const [r, g, bl] = flowColorAt(t);
        ctx.strokeStyle = `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(bl)}, ${0.75 + 0.25 * t})`;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
        ctx.stroke();
      }
    }
  }
}
