import { useMemo } from 'react';
import { TerrainStats } from '../../core';
import {
  flowColorAt,
  getLens,
  LENSES,
  slopeColorAt,
  SLOPE_MAX_PCT,
} from '../../render/lenses/lenses';
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

  // legenda da lente ativa — recomputada a cada edição para acompanhar o
  // mapa em tempo real. Declividade: escala fixa em %; Altitude: faixa REAL
  // do relevo em metros (a mesma que o shader usa).
  const legend = useMemo((): { gradient: string; labels: [string, string, string] } | null => {
    const grad = (color: (t: number) => string) => {
      const stops: string[] = [];
      for (let i = 0; i < LEGEND_STOPS; i++) stops.push(color(i / (LEGEND_STOPS - 1)));
      return `linear-gradient(to top, ${stops.join(', ')})`;
    };
    if (lens.slope) {
      const c = (t: number) => {
        const [r, g, b] = slopeColorAt(t * SLOPE_MAX_PCT);
        return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
      };
      return {
        gradient: grad(c),
        labels: [`≥${SLOPE_MAX_PCT}%`, `${SLOPE_MAX_PCT / 2}%`, '0%'],
      };
    }
    if (lens.overlays.hydrography) {
      const c = (t: number) => {
        const [r, g, b] = flowColorAt(t);
        return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
      };
      // topo = maior fluxo (rio), base = menor (nascente)
      return { gradient: grad(c), labels: ['Rios', 'Afluentes', 'Nascentes'] };
    }
    if (lens.buildRamp) {
      const range = new TerrainStats(session.world.terrain, session.world.config).displayRange();
      const ramp = lens.buildRamp(range);
      const c = (t: number) => {
        const idx = Math.round(t * 255) * 4;
        return `rgb(${ramp[idx]}, ${ramp[idx + 1]}, ${ramp[idx + 2]})`;
      };
      const fmt = (m: number) => `${Math.round(m)} m`;
      return {
        gradient: grad(c),
        labels: [fmt(range.max_m), fmt((range.max_m + range.min_m) / 2), fmt(range.min_m)],
      };
    }
    return null;
  }, [lens, historyTick, session]);

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
            {legend.labels.map((label, i) => (
              <span key={i}>{label}</span>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
