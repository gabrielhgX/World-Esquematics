import { useEffect, useRef } from 'react';
import type { Vec2 } from '../../render/Camera2D';
import { Viewport } from '../../render/Viewport';
import { SculptTool, type BrushSettings } from '../../tools/SculptTool';
import type { ProjectSession } from '../session';
import type { ActiveToolName } from './Toolbar';

interface Props {
  session: ProjectSession;
  activeTool: ActiveToolName;
  brush: BrushSettings;
  onCursorMove?: (worldPt: Vec2 | null) => void;
}

/** Ponte React → Viewport imperativo (a UI é descartável — README §2). */
export function ViewportView({ session, activeTool, brush, onCursorMove }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const sculptToolRef = useRef<SculptTool | null>(null);
  const cursorCallback = useRef(onCursorMove);
  cursorCallback.current = onCursorMove;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const viewport = new Viewport(host, session.world);
    viewport.onCursorMove = (pt) => cursorCallback.current?.(pt);
    viewportRef.current = viewport;

    sculptToolRef.current = new SculptTool({
      world: session.world,
      bus: session.bus,
      kernels: session.kernels,
      camera: viewport.camera,
      requestRender: () => viewport.requestRender(),
    });

    // Comandos, undo e redo redesenham o viewport (fluxo do README §2).
    const unsubscribe = [
      session.bus.events.on('executed', () => viewport.requestRender()),
      session.bus.events.on('undone', () => viewport.requestRender()),
      session.bus.events.on('redone', () => viewport.requestRender()),
    ];

    return () => {
      unsubscribe.forEach((off) => off());
      viewportRef.current = null;
      sculptToolRef.current = null;
      viewport.dispose();
    };
  }, [session]);

  useEffect(() => {
    viewportRef.current?.setTool(activeTool === 'sculpt' ? sculptToolRef.current : null);
  }, [activeTool, session]);

  useEffect(() => {
    if (sculptToolRef.current) sculptToolRef.current.brush = brush;
  }, [brush, session]);

  return <div className="viewport-host" ref={hostRef} />;
}
