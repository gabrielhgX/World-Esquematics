import type { BiomeDefinition } from '../../core';
import type { BiomeSettings } from '../../tools/BiomeTool';
import { OBJECT_TYPE_PRESETS, type ObjectSettings } from '../../tools/ObjectTool';

/** Controles de biomas (§4.4) e objetos manuais (§4.6). */

export function BiomeControls({
  palette,
  settings,
  onSettingsChange,
}: {
  palette: readonly BiomeDefinition[];
  settings: BiomeSettings;
  onSettingsChange: (settings: BiomeSettings) => void;
}) {
  return (
    <div className="tool-group brush-controls">
      <select
        value={settings.biomeId}
        onChange={(e) => onSettingsChange({ ...settings, biomeId: Number(e.target.value) })}
        title="Bioma da paleta"
      >
        {palette.map((biome) => (
          <option key={biome.id} value={biome.id}>
            {biome.name}
          </option>
        ))}
      </select>
      <span
        className="biome-swatch"
        style={{ background: palette.find((b) => b.id === settings.biomeId)?.color }}
      />
      <label title="Transição suave na borda — aplicada no weightmap de exportação">
        Feather (m)
        <input
          type="number"
          min="0"
          step="4"
          value={settings.featherRadius_m}
          onChange={(e) =>
            onSettingsChange({ ...settings, featherRadius_m: Number(e.target.value) })
          }
        />
      </label>
    </div>
  );
}

export function ObjectControls({
  settings,
  onSettingsChange,
}: {
  settings: ObjectSettings;
  onSettingsChange: (settings: ObjectSettings) => void;
}) {
  return (
    <div className="tool-group brush-controls">
      <select
        value={settings.type}
        onChange={(e) => onSettingsChange({ ...settings, type: e.target.value })}
        title="Tipo do objeto"
      >
        {OBJECT_TYPE_PRESETS.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      <label title="Alinha o objeto à declividade do terreno na exportação">
        <input
          type="checkbox"
          checked={settings.alignToSlope}
          onChange={(e) => onSettingsChange({ ...settings, alignToSlope: e.target.checked })}
        />
        Alinhar à encosta
      </label>
    </div>
  );
}
