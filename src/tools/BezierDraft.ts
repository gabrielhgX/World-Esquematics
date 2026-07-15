import { lineAsCubic, type Cubic, type Pt } from '../core';
import type { Camera2D } from '../render/Camera2D';

/**
 * Rascunho de Bézier GENÉRICO (README §11, item 17) — nós, handles e preview,
 * no estilo caneta: clique = nó de canto (segmento reto), clique-arrastar =
 * nó suave com handles espelhados. Reusado pela RoadTool; regiões, biomas e
 * rios adotam o mesmo rascunho nas próximas fases.
 *
 * O snap é responsabilidade de quem usa (a ferramenta conhece o grafo).
 */

export interface DraftAnchor {
  pos: Pt;
  /** handle de saída; o de entrada é o espelho (suavidade C1) */
  handleOut: Pt | null;
  /** nó existente ao qual este anchor foi "snapado" (id externo) */
  snappedNodeId: string | null;
}

export class BezierDraft {
  readonly anchors: DraftAnchor[] = [];
  private shaping = false;

  get isEmpty(): boolean {
    return this.anchors.length === 0;
  }

  /** pointerdown: novo anchor (com snap opcional resolvido pela ferramenta) */
  begin(pos: Pt, snappedNodeId: string | null = null): void {
    this.anchors.push({ pos, handleOut: null, snappedNodeId });
    this.shaping = true;
  }

  /** pointermove com botão pressionado: molda o handle do anchor atual */
  shape(pt: Pt): void {
    if (!this.shaping || this.anchors.length === 0) return;
    const anchor = this.anchors[this.anchors.length - 1];
    const dx = pt.x - anchor.pos.x;
    const dy = pt.y - anchor.pos.y;
    anchor.handleOut = Math.hypot(dx, dy) > 1e-6 ? pt : null;
  }

  /** pointerup: fecha a moldagem do anchor atual */
  end(): void {
    this.shaping = false;
  }

  cancel(): void {
    this.anchors.length = 0;
    this.shaping = false;
  }

  /** Segmentos cúbicos entre anchors consecutivos. */
  segments(): Cubic[] {
    const result: Cubic[] = [];
    for (let i = 1; i < this.anchors.length; i++) {
      result.push(segmentBetween(this.anchors[i - 1], this.anchors[i]));
    }
    return result;
  }

  /** Preview: caminho + nós + handles + elástico até o cursor. */
  drawOverlay(
    ctx: CanvasRenderingContext2D,
    camera: Camera2D,
    cursor: Pt | null,
    color: string,
  ): void {
    if (this.anchors.length === 0) return;

    ctx.strokeStyle = color;
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const first = camera.worldToScreen(this.anchors[0].pos);
    ctx.moveTo(first.x, first.y);
    for (const segment of this.segments()) {
      const c1 = camera.worldToScreen(segment.c1);
      const c2 = camera.worldToScreen(segment.c2);
      const p1 = camera.worldToScreen(segment.p1);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p1.x, p1.y);
    }
    if (cursor && !this.shaping) {
      const last = this.anchors[this.anchors.length - 1];
      const rubber = segmentBetween(last, { pos: cursor, handleOut: null, snappedNodeId: null });
      const c1 = camera.worldToScreen(rubber.c1);
      const c2 = camera.worldToScreen(rubber.c2);
      const p1 = camera.worldToScreen(rubber.p1);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p1.x, p1.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    for (const anchor of this.anchors) {
      const s = camera.worldToScreen(anchor.pos);
      if (anchor.handleOut) {
        const h = camera.worldToScreen(anchor.handleOut);
        const mirror = camera.worldToScreen(mirrorOf(anchor));
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(mirror.x, mirror.y);
        ctx.lineTo(h.x, h.y);
        ctx.stroke();
        for (const handle of [h, mirror]) {
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillRect(handle.x - 2, handle.y - 2, 4, 4);
        }
      }
      ctx.fillStyle = anchor.snappedNodeId ? '#ffd166' : color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function mirrorOf(anchor: DraftAnchor): Pt {
  const h = anchor.handleOut!;
  return { x: 2 * anchor.pos.x - h.x, y: 2 * anchor.pos.y - h.y };
}

/** c1 = handleOut de A; c2 = espelho do handleOut de B (entrada suave). */
function segmentBetween(a: DraftAnchor, b: DraftAnchor): Cubic {
  const straight = lineAsCubic(a.pos, b.pos);
  return {
    p0: a.pos,
    c1: a.handleOut ?? straight.c1,
    c2: b.handleOut ? mirrorOf(b) : straight.c2,
    p1: b.pos,
  };
}
