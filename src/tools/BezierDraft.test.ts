import { describe, expect, it } from 'vitest';
import { lineAsCubic } from '../core';
import { BezierDraft } from './BezierDraft';

describe('BezierDraft (README §11, item 17) — rascunho de caneta genérico', () => {
  it('nó de canto (sem arrasto): o segmento é a reta como cúbica', () => {
    const draft = new BezierDraft();
    expect(draft.isEmpty).toBe(true);
    draft.begin({ x: 0, y: 0 });
    draft.end();
    draft.begin({ x: 300, y: 0 });
    draft.end();

    const segs = draft.segments();
    expect(segs.length).toBe(1);
    const straight = lineAsCubic({ x: 0, y: 0 }, { x: 300, y: 0 });
    expect(segs[0].c1).toEqual(straight.c1);
    expect(segs[0].c2).toEqual(straight.c2);
    expect(segs[0].p0).toEqual({ x: 0, y: 0 });
    expect(segs[0].p1).toEqual({ x: 300, y: 0 });
  });

  it('nó suave (clique-arrasta): handle de saída + espelho na entrada (C1)', () => {
    const draft = new BezierDraft();
    draft.begin({ x: 0, y: 0 });
    draft.end();
    draft.begin({ x: 300, y: 0 });
    draft.shape({ x: 360, y: 60 }); // molda o handle de saída de B
    draft.end();

    const seg = draft.segments()[0];
    // c1 vem do handle de A (canto → reta); c2 é o ESPELHO do handle de B
    expect(seg.c1).toEqual(lineAsCubic({ x: 0, y: 0 }, { x: 300, y: 0 }).c1);
    expect(seg.c2).toEqual({ x: 240, y: -60 }); // 2·B.pos − handleOut
  });

  it('arrasto ínfimo não vira handle; cancel esvazia o rascunho', () => {
    const draft = new BezierDraft();
    draft.begin({ x: 10, y: 10 });
    draft.shape({ x: 10, y: 10 }); // movimento < epsilon → continua canto
    expect(draft.anchors[0].handleOut).toBeNull();
    draft.end();

    expect(draft.segments()).toEqual([]); // 1 anchor só: sem segmento
    draft.cancel();
    expect(draft.isEmpty).toBe(true);
  });
});
