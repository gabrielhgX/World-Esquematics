import { useCallback, useEffect, useRef, useState } from 'react';
import type { Vec2 } from '../render/Camera2D';
import type { Viewport } from '../render/Viewport';
import { loadWmap, saveWmap } from '../io/format/wmap';
import type { Platform } from '../platform/Platform';
import type { LicenseStatus } from '../platform/license';
import { LICENSE_REVALIDATE_MS } from '../platform/web/WebLicenseProvider';
import { AUTOSAVE_INTERVAL_MS, type ProjectSummary } from '../platform/ProjectRepository';
import { EXAMPLE_WORLDS } from '../examples/exampleWorlds';
import { DEFAULT_BRUSH, type BrushSettings } from '../tools/SculptTool';
import { DEFAULT_WATER_SETTINGS, type WaterSettings } from '../tools/WaterTool';
import { DEFAULT_ROAD_SETTINGS, type RoadSettings } from '../tools/RoadTool';
import { DEFAULT_REGION_SETTINGS, type RegionSettings } from '../tools/RegionTool';
import { DEFAULT_POI_SETTINGS, type POISettings } from '../tools/POITool';
import { DEFAULT_BIOME_SETTINGS, type BiomeSettings } from '../tools/BiomeTool';
import { DEFAULT_OBJECT_SETTINGS, type ObjectSettings } from '../tools/ObjectTool';
import { downloadBytes } from './download';
import { NewProjectDialog } from './components/NewProjectDialog';
import { Onboarding } from './components/Onboarding';
import { Outliner } from './components/Outliner';
import { ViewportView } from './components/ViewportView';
import { StatusBar } from './components/StatusBar';
import { Toolbar, type ActiveToolName } from './components/Toolbar';
import { createProjectSession, createSessionFromWorld, type ProjectSession } from './session';

export default function App({ platform }: { platform: Platform }) {
  const [session, setSession] = useState<ProjectSession | null>(null);
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
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
  const [exportTick, setExportTick] = useState(0);
  const [autosaveInfo, setAutosaveInfo] = useState<{ projectName: string; savedAt: number } | null>(
    null,
  );
  const viewportRef = useRef<Viewport | null>(null);
  const lastAutosavedTick = useRef(0);
  const historyTickRef = useRef(0);
  historyTickRef.current = historyTick;

  // Licença (README §10.2): valida no boot e revalida periodicamente. O
  // provider decide o modelo (JWT web / Steamworks); o App só respeita.
  useEffect(() => {
    let alive = true;
    const validate = () =>
      platform.licensing.getLicense().then((status) => {
        if (alive) setLicense(status);
      });
    void validate();
    const interval = setInterval(() => void validate(), LICENSE_REVALIDATE_MS);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [platform]);

  const refreshProjects = useCallback(
    () => platform.storage.list().then(setProjects, () => setProjects([])),
    [platform],
  );

  // Tela inicial: lista de projetos salvos + oferta do autosave mais recente.
  useEffect(() => {
    void refreshProjects();
    void platform.storage.readLatestAutosave().then((record) => {
      if (record) setAutosaveInfo({ projectName: record.projectName, savedAt: record.savedAt });
    });
  }, [platform, refreshProjects]);

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
        platform.storage.writeAutosave(session.world.config.projectName, bytes),
      );
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [session, platform]);

  const openWorldBytes = useCallback(async (bytes: Uint8Array) => {
    const world = await loadWmap(bytes);
    setSession(createSessionFromWorld(world));
    setHistoryTick(0);
    lastAutosavedTick.current = 0;
  }, []);

  // Salvar = repositório da plataforma (IndexedDB na web — §10.2).
  const handleSaveProject = useCallback(async () => {
    if (!session) return;
    const thumbnail = viewportRef.current?.captureThumbnailPng() ?? undefined;
    const bytes = await saveWmap(session.world, { thumbnailPng: thumbnail });
    const name = session.world.config.projectName;
    await platform.storage.save(name, name, bytes);
    platform.telemetry.event('project_saved', { bytes: bytes.length });
    void refreshProjects();
  }, [session, platform, refreshProjects]);

  // Baixar = arquivo .wmap portátil (backup, outra máquina).
  const handleDownloadProject = useCallback(async () => {
    if (!session) return;
    const thumbnail = viewportRef.current?.captureThumbnailPng() ?? undefined;
    const bytes = await saveWmap(session.world, { thumbnailPng: thumbnail });
    const safeName = session.world.config.projectName.replace(/[^\p{L}\p{N}_-]+/gu, '_');
    downloadBytes(`${safeName}.wmap`, bytes, 'application/zip');
  }, [session]);

  const handleOpenFile = useCallback(
    async (file: File) => {
      try {
        await openWorldBytes(new Uint8Array(await file.arrayBuffer()));
      } catch (error) {
        alert(`Não foi possível abrir o projeto: ${(error as Error).message}`);
      }
    },
    [openWorldBytes],
  );

  const handleOpenStored = useCallback(
    async (id: string) => {
      try {
        await openWorldBytes(await platform.storage.load(id));
      } catch (error) {
        alert(`Não foi possível abrir o projeto: ${(error as Error).message}`);
      }
    },
    [platform, openWorldBytes],
  );

  const handleDeleteStored = useCallback(
    async (id: string) => {
      await platform.storage.remove(id);
      void refreshProjects();
    },
    [platform, refreshProjects],
  );

  const handleOpenExample = useCallback(
    (id: string) => {
      const example = EXAMPLE_WORLDS.find((e) => e.id === id);
      if (!example) return;
      setSession(createSessionFromWorld(example.build()));
      setHistoryTick(0);
      lastAutosavedTick.current = 0;
      platform.telemetry.event('example_opened', { id });
    },
    [platform],
  );

  const handleRestoreAutosave = useCallback(async () => {
    const record = await platform.storage.readLatestAutosave();
    if (!record) return;
    await openWorldBytes(record.bytes);
  }, [platform, openWorldBytes]);

  // ---- gate de licença: nada renderiza sem uma licença válida ----
  if (license === null) {
    return (
      <div className="dialog-backdrop">
        <div className="dialog">Verificando licença…</div>
      </div>
    );
  }
  if (!license.ok) {
    return (
      <div className="dialog-backdrop">
        <div className="dialog license-blocked" data-testid="license-blocked">
          <h1>Licença</h1>
          <p>{license.reason}</p>
        </div>
      </div>
    );
  }
  const licenseLabel =
    (license.license.entitlements.includes('dev')
      ? 'licença dev'
      : license.license.plan === 'steam-lifetime'
        ? `Steam · v${license.license.majorVersion}.x vitalícia`
        : 'assinatura web') + (license.offline ? ' · offline' : '');

  if (!session) {
    return (
      <NewProjectDialog
        onCreate={(config) => {
          setSession(createProjectSession(config));
          platform.telemetry.event('project_created', {
            extent_m: config.extent.width_m,
            resolution_m: config.terrainResolution_m,
          });
        }}
        onOpenFile={handleOpenFile}
        projects={projects}
        onOpenStored={handleOpenStored}
        onDeleteStored={handleDeleteStored}
        onOpenExample={handleOpenExample}
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
        onDownloadProject={handleDownloadProject}
        onOpenProject={handleOpenFile}
        onExportedUnreal={() => {
          setExportTick((n) => n + 1);
          platform.telemetry.event('export_unreal');
        }}
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
        <Onboarding session={session} exportTick={exportTick} />
      </div>
      <StatusBar world={session.world} cursor={cursor} licenseLabel={licenseLabel} />
    </div>
  );
}
