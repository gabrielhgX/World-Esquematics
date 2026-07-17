import { useEffect, useState } from 'react';
import { AddRiversCommand, SetSeaLevelCommand, suggestRivers } from '../../core';
import type { WaterMode, WaterSettings } from '../../tools/WaterTool';
import type { ProjectSession } from '../session';

interface Props {
  session: ProjectSession;
  settings: WaterSettings;
  onSettingsChange: (settings: WaterSettings) => void;
  /** re-sincroniza o campo de nível do mar após undo/redo */
  historyTick: number;
}

/** Controles da água (README §7.2): lago, rio, nível do mar, sugerir rios. */
export function WaterControls({ session, settings, onSettingsChange, historyTick }: Props) {
  const [seaLevelText, setSeaLevelText] = useState(String(session.world.water.seaLevel_m));
  const [suggesting, setSuggesting] = useState(false);
  const oceanEnabled = session.world.water.oceanEnabled; // re-render via historyTick

  useEffect(() => {
    setSeaLevelText(String(session.world.water.seaLevel_m));
  }, [session, historyTick]);

  const commitSeaLevel = (text: string) => {
    setSeaLevelText(text);
    const value = Number(text);
    if (!Number.isFinite(value)) return;
    // ajuste contínuo coalesce num único comando (selado no blur)
    session.bus.execute(new SetSeaLevelCommand(value), { coalesce: true });
  };

  const handleSuggestRivers = () => {
    setSuggesting(true);
    try {
      const rivers = suggestRivers(session.world.terrain, session.world.config.terrainResolution_m);
      if (rivers.length === 0) {
        alert('Nenhum leito natural encontrado — esculpa vales primeiro.');
        return;
      }
      session.bus.execute(new AddRiversCommand('Sugerir rios', rivers));
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="tool-group brush-controls">
      <select
        value={settings.mode}
        onChange={(e) => onSettingsChange({ ...settings, mode: e.target.value as WaterMode })}
        title="Modo da ferramenta de água"
      >
        <option value="lake">Preencher lago</option>
        <option value="river">Desenhar rio</option>
      </select>

      {settings.mode === 'lake' && (
        <label>
          Cota (m)
          <input
            type="number"
            step="1"
            value={settings.lakeSurface_m}
            onChange={(e) =>
              onSettingsChange({ ...settings, lakeSurface_m: Number(e.target.value) })
            }
          />
        </label>
      )}

      {settings.mode === 'river' && (
        <>
          <label>
            Largura (m)
            <input
              type="number"
              min="1"
              step="1"
              value={settings.riverWidth_m}
              onChange={(e) =>
                onSettingsChange({ ...settings, riverWidth_m: Number(e.target.value) })
              }
            />
          </label>
          <label title="Carvar o leito no relevo ao concluir (comando explícito)">
            <input
              type="checkbox"
              checked={settings.carveBed}
              onChange={(e) => onSettingsChange({ ...settings, carveBed: e.target.checked })}
            />
            Carvar
          </label>
          {settings.carveBed && (
            <label>
              Prof. (m)
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={settings.carveDepth_m}
                onChange={(e) =>
                  onSettingsChange({ ...settings, carveDepth_m: Number(e.target.value) })
                }
              />
            </label>
          )}
          <span className="hint">Enter conclui · Esc cancela</span>
        </>
      )}

      <label title="Liga/desliga o oceano global — água nunca aparece sozinha ao escavar">
        <input
          type="checkbox"
          checked={oceanEnabled}
          onChange={(e) => {
            session.bus.execute(
              new SetSeaLevelCommand(session.world.water.seaLevel_m, e.target.checked),
            );
          }}
        />
        Mar
      </label>
      {oceanEnabled && (
        <label title="Cota do oceano global — reflete instantaneamente">
          Cota do mar (m)
          <input
            type="number"
            step="1"
            value={seaLevelText}
            onChange={(e) => commitSeaLevel(e.target.value)}
            onBlur={() => session.bus.sealCoalescing()}
          />
        </label>
      )}

      <button
        onClick={handleSuggestRivers}
        disabled={suggesting}
        title="D8 flow accumulation: gera splines nos leitos naturais do relevo"
      >
        {suggesting ? 'Analisando…' : 'Sugerir rios'}
      </button>
    </div>
  );
}
