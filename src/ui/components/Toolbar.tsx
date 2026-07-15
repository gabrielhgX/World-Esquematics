import { useState } from 'react';
import { UnrealExporter } from '../../io/exporters/unreal/UnrealExporter';
import { writeZip } from '../../io/format/zip';
import type { BrushSettings } from '../../tools/SculptTool';
import type { WaterSettings } from '../../tools/WaterTool';
import { downloadBytes } from '../download';
import type { ProjectSession } from '../session';
import { SculptControls } from './SculptControls';
import { WaterControls } from './WaterControls';

export type ActiveToolName = 'pan' | 'sculpt' | 'water';

interface Props {
  session: ProjectSession;
  activeTool: ActiveToolName;
  onToolChange: (tool: ActiveToolName) => void;
  brush: BrushSettings;
  onBrushChange: (brush: BrushSettings) => void;
  waterSettings: WaterSettings;
  onWaterSettingsChange: (settings: WaterSettings) => void;
  /** muda a cada comando/undo/redo — mantém os botões sincronizados */
  historyTick: number;
}

export function Toolbar({
  session,
  activeTool,
  onToolChange,
  brush,
  onBrushChange,
  waterSettings,
  onWaterSettingsChange,
  historyTick,
}: Props) {
  const { history, bus } = session;
  const [exporting, setExporting] = useState(false);

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
        <button
          className={activeTool === 'pan' ? 'active' : ''}
          onClick={() => onToolChange('pan')}
          title="Mover o mapa (arrastar)"
        >
          Mover
        </button>
        <button
          className={activeTool === 'sculpt' ? 'active' : ''}
          onClick={() => onToolChange('sculpt')}
          title="Esculpir o relevo"
        >
          Esculpir
        </button>
        <button
          className={activeTool === 'water' ? 'active' : ''}
          onClick={() => onToolChange('water')}
          title="Água: lagos, rios e nível do mar"
        >
          Água
        </button>
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

      <div className="tool-group toolbar-right">
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
