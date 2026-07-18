import { useRef, useState } from 'react';
import { UnrealExporter } from '../../io/exporters/unreal/UnrealExporter';
import { writeZip } from '../../io/format/zip';
import type { BrushSettings } from '../../tools/SculptTool';
import type { WaterSettings } from '../../tools/WaterTool';
import type { RoadSettings } from '../../tools/RoadTool';
import type { RegionSettings } from '../../tools/RegionTool';
import type { POISettings } from '../../tools/POITool';
import type { BiomeSettings } from '../../tools/BiomeTool';
import type { ObjectSettings } from '../../tools/ObjectTool';
import { downloadBytes } from '../download';
import type { ProjectSession } from '../session';
import { SculptControls } from './SculptControls';
import { WaterControls } from './WaterControls';
import { RoadControls } from './RoadControls';
import { MeasureControls, POIControls, RegionControls } from './VectorControls';
import { BiomeControls, ObjectControls } from './BiomeObjectControls';

/** Ajustes de exibição (P0-3/P0-7): z-factor do hillshade e curvas de nível. */
export interface ViewSettings {
  zFactor: number | 'auto';
  contours: boolean;
  contourInterval: number | 'auto';
}

export type ActiveToolName =
  'pan' | 'sculpt' | 'water' | 'road' | 'biome' | 'object' | 'region' | 'poi' | 'measure';

/**
 * Dica de cada ferramenta (P2-2): antes espremidas em 4 linhas de itálico
 * DENTRO da toolbar; agora vão para um toast no rodapé do viewport, uma
 * linha só. '' = ferramenta sem dica.
 */
export const TOOL_HINTS: Record<ActiveToolName, string> = {
  pan: '',
  sculpt: 'Arraste para esculpir · segure o botão para fluxo contínuo',
  water: 'Lago: clique numa depressão · Rio: cliques + Enter · Esc cancela',
  road: 'Clique-arrastar cria a curva · Enter conclui · Esc cancela',
  biome: 'Cliques desenham o polígono · Enter fecha · Esc cancela',
  object: 'Clique posiciona o objeto',
  region: 'Cliques desenham o polígono · Enter fecha · Esc cancela',
  poi: 'Clique posiciona o POI',
  measure: 'Cliques medem distância plana e real · Enter fecha o polígono (área) · Esc limpa',
};

interface Props {
  session: ProjectSession;
  activeTool: ActiveToolName;
  onToolChange: (tool: ActiveToolName) => void;
  brush: BrushSettings;
  onBrushChange: (brush: BrushSettings) => void;
  waterSettings: WaterSettings;
  onWaterSettingsChange: (settings: WaterSettings) => void;
  roadSettings: RoadSettings;
  onRoadSettingsChange: (settings: RoadSettings) => void;
  regionSettings: RegionSettings;
  onRegionSettingsChange: (settings: RegionSettings) => void;
  poiSettings: POISettings;
  onPOISettingsChange: (settings: POISettings) => void;
  biomeSettings: BiomeSettings;
  onBiomeSettingsChange: (settings: BiomeSettings) => void;
  objectSettings: ObjectSettings;
  onObjectSettingsChange: (settings: ObjectSettings) => void;
  /** salva no repositório da plataforma (IndexedDB/filesystem — §10.2) */
  onSaveProject: () => Promise<void>;
  /** baixa o .wmap portátil */
  onDownloadProject: () => Promise<void>;
  /** abre um .wmap escolhido pelo usuário */
  onOpenProject: (file: File) => Promise<void>;
  /** avisa o App que um export Unreal concluiu (onboarding/telemetria) */
  onExportedUnreal: () => void;
  /** volta à tela inicial (novo projeto) */
  onNewProject: () => void;
  /** muda a cada comando/undo/redo — mantém os botões sincronizados */
  historyTick: number;
}

const TOOL_BUTTONS: Array<{ id: ActiveToolName; label: string; title: string }> = [
  { id: 'pan', label: 'Mover', title: 'Mover o mapa (arrastar)' },
  { id: 'sculpt', label: 'Esculpir', title: 'Esculpir o relevo' },
  { id: 'water', label: 'Água', title: 'Água: lagos, rios e nível do mar' },
  { id: 'road', label: 'Estrada', title: 'Estradas: grafo planar de splines' },
  { id: 'biome', label: 'Bioma', title: 'Pintar biomas por polígono' },
  { id: 'object', label: 'Objeto', title: 'Objetos manuais' },
  { id: 'region', label: 'Região', title: 'Regiões nomeadas (polígonos)' },
  { id: 'poi', label: 'POI', title: 'Pontos de interesse' },
  { id: 'measure', label: 'Medir', title: 'Medição — não altera o mundo' },
];

export function Toolbar({
  session,
  activeTool,
  onToolChange,
  brush,
  onBrushChange,
  waterSettings,
  onWaterSettingsChange,
  roadSettings,
  onRoadSettingsChange,
  regionSettings,
  onRegionSettingsChange,
  poiSettings,
  onPOISettingsChange,
  biomeSettings,
  onBiomeSettingsChange,
  objectSettings,
  onObjectSettingsChange,
  onSaveProject,
  onDownloadProject,
  onOpenProject,
  onExportedUnreal,
  onNewProject,
  historyTick,
}: Props) {
  const { history, bus } = session;
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveProject();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  // Fase 1.5 (README §11, ordem 0→1→6): exportador Unreal mínimo, só o
  // heightmap — validate() antes, avisos de reamostragem para o usuário.
  const handleExportUnreal = async () => {
    const exporter = new UnrealExporter();
    const issues = exporter.validate(session.world);
    const errors = issues.filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      alert(`Não foi possível exportar:\n${errors.map((e) => `• ${e.message}`).join('\n')}`);
      return;
    }
    setExporting(true);
    try {
      const bundle = await exporter.export(session.world);
      const zip = writeZip(bundle.files.map((f) => ({ path: f.path, data: f.data })));
      const safeName = session.world.config.projectName.replace(/[^\p{L}\p{N}_-]+/gu, '_');
      downloadBytes(`${safeName}-unreal.zip`, zip, 'application/zip');
      const messages = [...issues.map((i) => i.message), ...bundle.notes];
      if (messages.length > 0) {
        alert(`Exportado para Unreal.\n${messages.map((m) => `• ${m}`).join('\n')}`);
      }
      onExportedUnreal();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="toolbar">
      <div className="tool-group">
        {TOOL_BUTTONS.map((tool) => (
          <button
            key={tool.id}
            className={activeTool === tool.id ? 'active' : ''}
            onClick={() => onToolChange(tool.id)}
            title={tool.title}
          >
            {tool.label}
          </button>
        ))}
      </div>

      {activeTool === 'sculpt' && <SculptControls brush={brush} onBrushChange={onBrushChange} />}
      {activeTool === 'water' && (
        <WaterControls
          session={session}
          settings={waterSettings}
          onSettingsChange={onWaterSettingsChange}
          historyTick={historyTick}
        />
      )}
      {activeTool === 'road' && (
        <RoadControls
          session={session}
          settings={roadSettings}
          onSettingsChange={onRoadSettingsChange}
        />
      )}
      {activeTool === 'biome' && (
        <BiomeControls
          palette={session.world.biomes.palette}
          settings={biomeSettings}
          onSettingsChange={onBiomeSettingsChange}
        />
      )}
      {activeTool === 'object' && (
        <ObjectControls settings={objectSettings} onSettingsChange={onObjectSettingsChange} />
      )}
      {activeTool === 'region' && (
        <RegionControls settings={regionSettings} onSettingsChange={onRegionSettingsChange} />
      )}
      {activeTool === 'poi' && (
        <POIControls settings={poiSettings} onSettingsChange={onPOISettingsChange} />
      )}
      {activeTool === 'measure' && <MeasureControls />}

      <div className="tool-group toolbar-right">
        <button onClick={onNewProject} title="Voltar à tela inicial / novo projeto">
          Novo
        </button>
        <button onClick={handleSave} disabled={saving} title="Salvar no navegador (§10.2)">
          {saving ? 'Salvando…' : saved ? 'Salvo ✓' : 'Salvar'}
        </button>
        <button onClick={() => void onDownloadProject()} title="Baixar o arquivo .wmap portátil">
          Baixar
        </button>
        <button onClick={() => fileInputRef.current?.click()} title="Abrir projeto (.wmap)">
          Abrir
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".wmap"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onOpenProject(file);
            e.target.value = '';
          }}
        />
        <button
          onClick={handleExportUnreal}
          disabled={exporting}
          title="Exportar heightmap para o Landscape da Unreal"
        >
          {exporting ? 'Exportando…' : 'Exportar Unreal'}
        </button>
        <button onClick={() => bus.undo()} disabled={!history.canUndo} title="Desfazer (Ctrl+Z)">
          ↩ Desfazer
        </button>
        <button
          onClick={() => bus.redo()}
          disabled={!history.canRedo}
          title="Refazer (Ctrl+Shift+Z)"
        >
          ↪ Refazer
        </button>
        <span className="history-usage" title="Memória do histórico de undo">
          {(history.usedBytes / 1_000_000).toFixed(0)} MB
        </span>
      </div>
    </div>
  );
}
