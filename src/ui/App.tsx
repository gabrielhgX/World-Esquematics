import { useEffect, useState } from 'react';
import type { Vec2 } from '../render/Camera2D';
import { DEFAULT_BRUSH, type BrushSettings } from '../tools/SculptTool';
import { DEFAULT_WATER_SETTINGS, type WaterSettings } from '../tools/WaterTool';
import { NewProjectDialog } from './components/NewProjectDialog';
import { ViewportView } from './components/ViewportView';
import { StatusBar } from './components/StatusBar';
import { Toolbar, type ActiveToolName } from './components/Toolbar';
import { createProjectSession, type ProjectSession } from './session';

export default function App() {
  const [session, setSession] = useState<ProjectSession | null>(null);
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveToolName>('sculpt');
  const [brush, setBrush] = useState<BrushSettings>({ ...DEFAULT_BRUSH });
  const [waterSettings, setWaterSettings] = useState<WaterSettings>({
    ...DEFAULT_WATER_SETTINGS,
  });
  const [historyTick, setHistoryTick] = useState(0);

  // Undo/redo por teclado + botões sempre em dia com o histórico.
  useEffect(() => {
    if (!session) return;
    const bump = () => setHistoryTick((n) => n + 1);
    const unsubscribe = [
      session.bus.events.on('executed', bump),
      session.bus.events.on('undone', bump),
      session.bus.events.on('redone', bump),
    ];

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
          e.preventDefault();
          session.bus.redo();
        }
        return;
      }
      e.preventDefault();
      if (e.shiftKey) session.bus.redo();
      else session.bus.undo();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      unsubscribe.forEach((off) => off());
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [session]);

  if (!session) {
    return <NewProjectDialog onCreate={(config) => setSession(createProjectSession(config))} />;
  }

  return (
    <div className="app">
      <Toolbar
        session={session}
        activeTool={activeTool}
        onToolChange={setActiveTool}
        brush={brush}
        onBrushChange={setBrush}
        waterSettings={waterSettings}
        onWaterSettingsChange={setWaterSettings}
        historyTick={historyTick}
      />
      <ViewportView
        session={session}
        activeTool={activeTool}
        brush={brush}
        waterSettings={waterSettings}
        onCursorMove={setCursor}
      />
      <StatusBar world={session.world} cursor={cursor} />
    </div>
  );
}
