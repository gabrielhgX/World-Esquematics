import type { RegionSettings } from '../../tools/RegionTool';
import type { POISettings } from '../../tools/POITool';

/** Controles das camadas vetoriais simples (README §4.6) + medição (§7.3). */

const POI_ICONS = ['★', '⚑', '⌂', '♦', '⚔', '☗', '✦'];

export function RegionControls({
  settings,
  onSettingsChange,
}: {
  settings: RegionSettings;
  onSettingsChange: (settings: RegionSettings) => void;
}) {
  return (
    <div className="tool-group brush-controls">
      <label>
        Nome
        <input
          type="text"
          value={settings.name}
          onChange={(e) => onSettingsChange({ ...settings, name: e.target.value })}
        />
      </label>
      <label>
        Cor
        <input
          type="color"
          value={settings.color}
          onChange={(e) => onSettingsChange({ ...settings, color: e.target.value })}
        />
      </label>
    </div>
  );
}

export function POIControls({
  settings,
  onSettingsChange,
}: {
  settings: POISettings;
  onSettingsChange: (settings: POISettings) => void;
}) {
  return (
    <div className="tool-group brush-controls">
      <label>
        Nome
        <input
          type="text"
          value={settings.name}
          onChange={(e) => onSettingsChange({ ...settings, name: e.target.value })}
        />
      </label>
      <select
        value={settings.icon}
        onChange={(e) => onSettingsChange({ ...settings, icon: e.target.value })}
        title="Ícone do POI"
      >
        {POI_ICONS.map((icon) => (
          <option key={icon} value={icon}>
            {icon}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A ferramenta de medição não tem opções — a dica vai no toast (P2-2). */
export function MeasureControls() {
  return null;
}
