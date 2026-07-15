import { deriveGrid, estimateTerrainBytes, type WorldData } from '../../core';
import type { Vec2 } from '../../render/Camera2D';
import { formatMeters } from '../../render/format';

interface Props {
  world: WorldData;
  cursor: Vec2 | null;
}

export function StatusBar({ world, cursor }: Props) {
  const grid = deriveGrid(world.config);
  const megabytes = estimateTerrainBytes(world.config) / 1_000_000;

  return (
    <footer className="status-bar">
      <span>{world.config.projectName}</span>
      <span>
        grid {grid.widthCells} × {grid.heightCells} @ {world.config.terrainResolution_m} m/célula
      </span>
      <span>heightmap ≈ {megabytes.toFixed(0)} MB</span>
      <span className="status-cursor">
        {cursor ? `L ${formatMeters(cursor.x)} · N ${formatMeters(cursor.y)}` : '—'}
      </span>
    </footer>
  );
}
