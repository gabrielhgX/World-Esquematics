import { useEffect, useRef } from 'react';
import type { WorldData } from '../../core';
import type { Vec2 } from '../../render/Camera2D';
import { Viewport } from '../../render/Viewport';

interface Props {
  world: WorldData;
  onCursorMove?: (worldPt: Vec2 | null) => void;
}

/** Ponte React → Viewport imperativo (a UI é descartável — README §2). */
export function ViewportView({ world, onCursorMove }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cursorCallback = useRef(onCursorMove);
  cursorCallback.current = onCursorMove;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const viewport = new Viewport(host, world);
    viewport.onCursorMove = (pt) => cursorCallback.current?.(pt);
    return () => viewport.dispose();
  }, [world]);

  return <div className="viewport-host" ref={hostRef} />;
}
