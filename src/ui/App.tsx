import { useCallback, useEffect, useRef, useState } from 'react';
import type { Vec2 } from '../render/Camera2D';
import type { Viewport } from '../render/Viewport';
import { loadWmap, saveWmap } from '../io/format/wmap';
import { DEFAULT_BRUSH, type BrushSettings } from '../tools/SculptTool';
import { DEFAULT_WATER_SETTINGS, type WaterSettings } from '../tools/WaterTool';
import { DEFAULT_ROAD_SETTINGS, type RoadSettings } from '../tools/RoadTool';
import { DEFAULT_REGION_SETTINGS, type RegionSettings } from '../tools/RegionTool';
import { DEFAULT_POI_SETTINGS, type POISettings } from '../tools/POITool';
import { DEFAULT_BIOME_SETTINGS, type BiomeSettings } from '../tools/BiomeTool';
import { DEFAULT_OBJECT_SETTINGS, type ObjectSettings } from '../tools/ObjectTool';
import { AUTOSAVE_INTERVAL_MS, readLatestAutosave, writeAutosave } from './autosave';
import { downloadBytes } from './download';
import { NewProjectDialog } from './components/NewProjectDialog';
import { Outliner } from './components/Outliner';
import { ViewportView } from './components/ViewportView';
import { StatusBar } from './components/StatusBar';
import { Toolbar, type ActiveToolName } from './components/Toolbar';
import { createProjectSession, createSessionFromWorld, type ProjectSession } from './session';

export default function App() {
  const [session, setSession] = useState<ProjectSession | null>(null);
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveToolName>('sculpt');
  const [brush, setBrush] = useState<BrushSettings>({ ...DEFAULT_BRUSH });
  const [waterSettings, setWaterSettings] = useState<WaterSettings>({
    ...DEFAULT_WATER_SETTINGS,
  });
  const [roadSettings, setRoadSettings] = useState<RoadSettings>({ ...DEFAULT_ROAD_SETTINGS });
  const [regionSettings, setRegionSettings] = useState<RegionSettings>({
    ...DEFAULT_REGION_SETTINGS,
  });
  const [poiSettings, setPOISettings] = useState<POISettings>({ ...DEFAULT_POI_SETTINGS });
  const [biomeSettings, setBiomeSettings] = useState<BiomeSettings>({ ...DEFAULT_BIOME_SETTINGS });
  const [objectSettings, setObjectSettings] = useState<ObjectSettings>({
    ...DEFAULT_OBJECT_SETTINGS,
  });
  const [historyTick, setHistoryTick] = useState(0);
  const [autosaveInfo, setAutosaveInfo] = useState<{ projectName: string; savedAt: number } | null>(
    null,
  );
  const viewportRef = useRef<Viewport | null>(null);
  const lastAutosavedTick = useRef(0);
  const historyTickRef = useRef(0);
  historyTickRef.current = historyTick;

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

  // Autosave a cada 5 min em slot rotativo (README §8) — só se algo mudou.
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      if (historyTickRef.current === lastAutosavedTick.current) return;
      lastAutosavedTick.current = historyTickRef.current;
      void saveWmap(session.world).then((bytes) =>
        writeAutosave(session.world.config.projectName, bytes),
      );
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [session]);

  // Oferece restauração do autosave mais recente na tela inicial.
  useEffect(() => {
    void readLatestAutosave().then((record) => {
      if (record) setAutosaveInfo({ projectName: record.projectName, savedAt: record.savedAt });
    });
  }, []);

  const handleSaveProject = useCallback(async () => {
    if (!session) return;
    const thumbnail = viewportRef.current?.captureThumbnailPng() ?? undefined;
    const bytes = await saveWmap(session.world, { thumbnailPng: thumbnail });
    const safeName = session.world.config.projectName.replace(/[^\p{L}\p{N}_-]+/gu, '_');
    downloadBytes(`${safeName}.wmap`, bytes, 'application/zip');
  }, [session]);

  const handleOpenProject = useCallback(async (file: File) => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const world = await loadWmap(bytes);
      setSession(createSessionFromWorld(world));
      setHistoryTick(0);
      lastAutosavedTick.current = 0;
    } catch (error) {
      alert(`Não foi possível abrir o projeto: ${(error as Error).message}`);
    }
  }, []);

  const handleRestoreAutosave = useCallback(async () => {
    const record = await readLatestAutosave();
    if (!record) return;
    const world = await loadWmap(record.bytes);
    setSession(createSessionFromWorld(world));
  }, []);

  if (!session) {
    return (
      <NewProjectDialog
        onCreate={(config) => setSession(createProjectSession(config))}
        onOpenFile={handleOpenProject}
        autosave={autosaveInfo}
        onRestoreAutosave={handleRestoreAutosave}
      />
    );
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
        roadSettings={roadSettings}
        onRoadSettingsChange={setRoadSettings}
        regionSettings={regionSettings}
        onRegionSettingsChange={setRegionSettings}
        poiSettings={poiSettings}
        onPOISettingsChange={setPOISettings}
        biomeSettings={biomeSettings}
        onBiomeSettingsChange={setBiomeSettings}
        objectSettings={objectSettings}
        onObjectSettingsChange={setObjectSettings}
        onSaveProject={handleSaveProject}
        onOpenProject={handleOpenProject}
        historyTick={historyTick}
      />
      <div className="main-row">
        <Outliner session={session} historyTick={historyTick} />
        <ViewportView
          session={session}
          activeTool={activeTool}
          brush={brush}
          waterSettings={waterSettings}
          roadSettings={roadSettings}
          regionSettings={regionSettings}
          poiSettings={poiSettings}
          biomeSettings={biomeSettings}
          objectSettings={objectSettings}
          onCursorMove={setCursor}
          apiRef={viewportRef}
        />
      </div>
      <StatusBar world={session.world} cursor={cursor} />
    </div>
  );
}
