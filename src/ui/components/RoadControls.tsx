import { useState } from 'react';
import { findGradeViolations, type RoadType, type RasterKernels } from '../../core';
import type { RoadSettings } from '../../tools/RoadTool';
import { buildRoadsCarveCommand } from '../../tools/roadCarve';
import type { ProjectSession } from '../session';

interface Props {
  session: ProjectSession;
  settings: RoadSettings;
  onSettingsChange: (settings: RoadSettings) => void;
}

const TYPES: Array<{ id: RoadType; label: string }> = [
  { id: 'trail', label: 'Trilha' },
  { id: 'dirt', label: 'Terra' },
  { id: 'gravel', label: 'Cascalho' },
  { id: 'asphalt', label: 'Asfalto' },
  { id: 'highway', label: 'Rodovia' },
  { id: 'bridge', label: 'Ponte' },
];

/** Controles de estrada (README §4.5): tipo, largura, limite de inclinação
 *  e o carve EXPLÍCITO com validação de maxGrade_pct (item 19). */
export function RoadControls({ session, settings, onSettingsChange }: Props) {
  const [carving, setCarving] = useState(false);

  const handleCarve = (kernels: RasterKernels) => {
    const violations = findGradeViolations(session.world.terrain, session.world.roads);
    if (violations.length > 0) {
      const worst = violations
        .slice(0, 3)
        .map(
          (v) =>
            `• ${v.edge.type} com ${v.maxGrade_pct.toFixed(1)}% (limite ${v.edge.maxGrade_pct}%)`,
        )
        .join('\n');
      const proceed = confirm(
        `${violations.length} via(s) excedem a inclinação máxima:\n${worst}\n\nAplicar mesmo assim?`,
      );
      if (!proceed) return;
    }
    setCarving(true);
    try {
      const command = buildRoadsCarveCommand(session.world, kernels);
      if (!command) {
        alert('Nenhuma estrada para aplicar (pontes são ignoradas).');
        return;
      }
      session.bus.execute(command);
    } finally {
      setCarving(false);
    }
  };

  return (
    <div className="tool-group brush-controls">
      <select
        value={settings.type}
        onChange={(e) => onSettingsChange({ ...settings, type: e.target.value as RoadType })}
        title="Tipo da via — ponte ignora o relevo"
      >
        {TYPES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>

      <label>
        Largura (m)
        <input
          type="number"
          min="1"
          step="1"
          value={settings.width_m}
          onChange={(e) => onSettingsChange({ ...settings, width_m: Number(e.target.value) })}
        />
      </label>

      <label title="Inclinação máxima permitida — validada no carve">
        Incl. máx (%)
        <input
          type="number"
          min="1"
          step="1"
          value={settings.maxGrade_pct}
          onChange={(e) => onSettingsChange({ ...settings, maxGrade_pct: Number(e.target.value) })}
        />
      </label>

      <button
        onClick={() => handleCarve(session.kernels)}
        disabled={carving}
        title="Comando explícito: aplaina o relevo sob todas as vias (exceto pontes)"
      >
        {carving ? 'Aplicando…' : 'Aplicar ao relevo'}
      </button>
    </div>
  );
}
