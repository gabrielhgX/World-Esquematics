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

export type ActiveToolName =
  'pan' | 'sculpt' | 'water' | 'road' | 'biome' | 'object' | 'region' | 'poi' | 'measure';

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
  /** salva o projeto (.wmap) — o App captura o thumbnail do viewport */
  onSaveProject: () => Promise<void>;
  /** abre um .wmap escolhido pelo usuário */
  onOpenProject: (file: File) => Promise<void>;
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
  onOpenProject,
  historyTick,
}: Props) {
  const { history, bus } = session;
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveProject();
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
        <button onClick={handleSave} disabled={saving} title="Salvar projeto (.wmap)">
          {saving ? 'Salvando…' : 'Salvar'}
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
