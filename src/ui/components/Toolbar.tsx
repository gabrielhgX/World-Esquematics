import { useState } from 'react';
import type { FalloffKind } from '../../core';
import { UnrealExporter } from '../../io/exporters/unreal/UnrealExporter';
import { writeZip } from '../../io/format/zip';
import type { BrushSettings, SculptMode } from '../../tools/SculptTool';
import { downloadBytes } from '../download';
import type { ProjectSession } from '../session';

export type ActiveToolName = 'pan' | 'sculpt';

interface Props {
  session: ProjectSession;
  activeTool: ActiveToolName;
  onToolChange: (tool: ActiveToolName) => void;
  brush: BrushSettings;
  onBrushChange: (brush: BrushSettings) => void;
  /** muda a cada comando/undo/redo — mantém os botões sincronizados */
  historyTick: number;
}

const MODES: Array<{ id: SculptMode; label: string }> = [
  { id: 'raise', label: 'Elevar' },
  { id: 'lower', label: 'Rebaixar' },
  { id: 'smooth', label: 'Suavizar' },
  { id: 'flatten', label: 'Aplainar' },
];

const FALLOFFS: Array<{ id: FalloffKind; label: string }> = [
  { id: 'smooth', label: 'Suave' },
  { id: 'linear', label: 'Linear' },
  { id: 'sharp', label: 'Agudo' },
  { id: 'constant', label: 'Constante' },
];

export function Toolbar({ session, activeTool, onToolChange, brush, onBrushChange }: Props) {
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
      </div>

      {activeTool === 'sculpt' && (
        <div className="tool-group brush-controls">
          <select
            value={brush.mode}
            onChange={(e) => onBrushChange({ ...brush, mode: e.target.value as SculptMode })}
            title="Modo do pincel"
          >
            {MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          <label>
            Raio
            <input
              type="range"
              min="10"
              max="2000"
              step="10"
              value={brush.radius_m}
              onChange={(e) => onBrushChange({ ...brush, radius_m: Number(e.target.value) })}
            />
            <span className="value">{brush.radius_m} m</span>
          </label>

          <label>
            Força
            <input
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              value={brush.strength}
              onChange={(e) => onBrushChange({ ...brush, strength: Number(e.target.value) })}
            />
            <span className="value">{Math.round(brush.strength * 100)}%</span>
          </label>

          <select
            value={brush.falloff}
            onChange={(e) => onBrushChange({ ...brush, falloff: e.target.value as FalloffKind })}
            title="Falloff do pincel"
          >
            {FALLOFFS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
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
