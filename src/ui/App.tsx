import { useState } from 'react';
import type { Vec2 } from '../render/Camera2D';
import { NewProjectDialog } from './components/NewProjectDialog';
import { ViewportView } from './components/ViewportView';
import { StatusBar } from './components/StatusBar';
import { createProjectSession, type ProjectSession } from './session';

export default function App() {
  const [session, setSession] = useState<ProjectSession | null>(null);
  const [cursor, setCursor] = useState<Vec2 | null>(null);

  if (!session) {
    return <NewProjectDialog onCreate={(config) => setSession(createProjectSession(config))} />;
  }

  return (
    <div className="app">
      <ViewportView world={session.world} onCursorMove={setCursor} />
      <StatusBar world={session.world} cursor={cursor} />
    </div>
  );
}
