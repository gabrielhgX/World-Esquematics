import { useMemo } from 'react';
import { TerrainStats } from '../../core';
import { getLens, LENSES } from '../../render/lenses/lenses';
import type { ProjectSession } from '../session';
import type { ViewSettings } from './Toolbar';

/**
 * Controles de VISTA (P2-1): lente, exagero do relevo e curvas de nível —
 * fora da toolbar, num painel no canto do viewport, onde controles de câmera
 * moram. Inclui a LEGENDA da lente ativa (P2-3): sem valores, uma lente é
 * decoração; com eles, comunica a faixa REAL do relevo — a informação que
 * faltava ao usuário.
 */

interface Props {
  session: ProjectSession;
  /** re-mede a faixa do relevo após cada edição */
  historyTick: number;
  lensId: string;
  onLensChange: (lensId: string) => void;
  viewSettings: ViewSettings;
  onViewSettingsChange: (settings: ViewSettings) => void;
}

const LEGEND_STOPS = 24;

export function ViewControls({
  session,
  historyTick,
  lensId,
  onLensChange,
  viewSettings,
  onViewSettingsChange,
}: Props) {
  const lens = getLens(lensId);

  // faixa de exibição REAL do relevo (mesma que o shader usa) — recomputada
  // a cada edição para a legenda acompanhar o mapa em tempo real.
  const legend = useMemo(() => {
    if (!lens.buildRamp) return null;
    const stats = new TerrainStats(session.world.terrain, session.world.config);
    const range = stats.displayRange();
    const ramp = lens.buildRamp(range);
    const stops: string[] = [];
    for (let i = 0; i < LEGEND_STOPS; i++) {
      const idx = Math.round((i / (LEGEND_STOPS - 1)) * 255) * 4;
      stops.push(`rgb(${ramp[idx]}, ${ramp[idx + 1]}, ${ramp[idx + 2]})`);
    }
    return { range, gradient: `linear-gradient(to top, ${stops.join(', ')})` };
  }, [lens, historyTick, session]);

  const fmt = (m: number) => `${Math.round(m)} m`;

  return (
    <aside className="view-controls" data-testid="view-controls">
      <label className="lens-picker" title="Lente de visualização — só muda a exibição do mapa">
        Lente
        <select
          value={lensId}
          onChange={(e) => onLensChange(e.target.value)}
          data-testid="lens-select"
        >
          {LENSES.map((l) => (
            <option key={l.id} value={l.id} title={l.description}>
              {l.name}
            </option>
          ))}
        </select>
      </label>

      <label
        className="lens-picker"
        title="Exagero vertical do sombreado — Auto mira o relevo real do mapa"
      >
        Relevo
        <select
          value={String(viewSettings.zFactor)}
          onChange={(e) =>
            onViewSettingsChange({
              ...viewSettings,
              zFactor: e.target.value === 'auto' ? 'auto' : Number(e.target.value),
            })
          }
          data-testid="zfactor-select"
        >
          <option value="auto">Auto</option>
          {[1, 2, 4, 8, 12, 16, 20].map((z) => (
            <option key={z} value={z}>
              ×{z}
            </option>
          ))}
        </select>
      </label>

      <div className="lens-picker">
        <label title="Curvas de nível (intervalo Auto segue o relevo)">
          <input
            type="checkbox"
            checked={viewSettings.contours}
            onChange={(e) => onViewSettingsChange({ ...viewSettings, contours: e.target.checked })}
            data-testid="contours-toggle"
          />
          Curvas
        </label>
        {viewSettings.contours && (
          <select
            value={String(viewSettings.contourInterval)}
            onChange={(e) =>
              onViewSettingsChange({
                ...viewSettings,
                contourInterval: e.target.value === 'auto' ? 'auto' : Number(e.target.value),
              })
            }
            title="Intervalo das curvas de nível"
            data-testid="contour-interval"
          >
            <option value="auto">Auto</option>
            {[1, 2, 5, 10, 20, 50, 100].map((v) => (
              <option key={v} value={v}>
                {v} m
              </option>
            ))}
          </select>
        )}
      </div>

      {legend && (
        <div className="lens-legend" data-testid="lens-legend">
          <div className="lens-legend-bar" style={{ background: legend.gradient }} />
          <div className="lens-legend-labels">
            <span>{fmt(legend.range.max_m)}</span>
            <span>{fmt((legend.range.max_m + legend.range.min_m) / 2)}</span>
            <span>{fmt(legend.range.min_m)}</span>
          </div>
        </div>
      )}
    </aside>
  );
}
