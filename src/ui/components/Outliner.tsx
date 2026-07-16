import { useState } from 'react';
import { SetLayerPropertyCommand, type Layer, type WorldData } from '../../core';
import type { ProjectSession } from '../session';

/**
 * Outliner (README §11, item 24): árvore das camadas com busca, hide e lock.
 * Hide/lock passam pelo CommandBus (SetLayerPropertyCommand, §5.2) — com
 * undo como qualquer edição. Agrupamento/tags entram com o sistema de
 * seleção de objetos.
 */

interface Props {
  session: ProjectSession;
  /** re-renderiza contagens após comandos/undo */
  historyTick: number;
}

function childrenOf(world: WorldData, layer: Layer): string[] {
  switch (layer.type) {
    case 'terrain':
      return [`${world.terrain.raster.allocatedTileCount} tiles esculpidos`];
    case 'biome':
      return world.biomes.polygons.map(
        (p) => `${world.biomes.getBiome(p.biomeId)?.name ?? `bioma ${p.biomeId}`}`,
      );
    case 'water': {
      const items = [`Oceano (cota ${world.water.seaLevel_m} m)`];
      items.push(...world.water.lakes.map((l) => `Lago (cota ${l.surface_m} m)`));
      items.push(...world.water.rivers.map((r) => `Rio (${r.nodes.length} nós)`));
      return items;
    }
    case 'road': {
      const byType = new Map<string, number>();
      for (const edge of world.roads.edges.values()) {
        byType.set(edge.type, (byType.get(edge.type) ?? 0) + 1);
      }
      return [...byType.entries()].map(([type, count]) => `${type} × ${count}`);
    }
    case 'region':
      return world.regions.regions.map((r) => r.name);
    case 'poi':
      return world.pois.pois.map((p) => `${p.icon} ${p.name}`);
    case 'object':
      return world.objects.objects.map((o) => o.type);
  }
}

function countOf(world: WorldData, layer: Layer): number {
  switch (layer.type) {
    case 'terrain':
      return world.terrain.raster.allocatedTileCount;
    case 'biome':
      return world.biomes.polygons.length;
    case 'water':
      return 1 + world.water.lakes.length + world.water.rivers.length;
    case 'road':
      return world.roads.edges.size;
    case 'region':
      return world.regions.regions.length;
    case 'poi':
      return world.pois.pois.length;
    case 'object':
      return world.objects.objects.length;
  }
}

export function Outliner({ session }: Props) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const world = session.world;
  const query = search.trim().toLowerCase();

  const toggleExpand = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setProperty = (layer: Layer, property: 'visible' | 'locked', value: boolean) => {
    session.bus.execute(new SetLayerPropertyCommand(layer.id, property, value));
  };

  return (
    <aside className="outliner">
      <input
        type="search"
        placeholder="Buscar…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {world.layers.inOrder().map((layer) => {
        const children = childrenOf(world, layer);
        const matches = query
          ? children.filter((child) => child.toLowerCase().includes(query))
          : children;
        if (query && matches.length === 0 && !layer.name.toLowerCase().includes(query)) {
          return null;
        }
        const isOpen = expanded.has(layer.id) || query.length > 0;
        return (
          <div key={layer.id} className="outliner-layer">
            <div className="outliner-row">
              <button
                className="tree-toggle"
                onClick={() => toggleExpand(layer.id)}
                title={isOpen ? 'Recolher' : 'Expandir'}
              >
                {isOpen ? '▾' : '▸'}
              </button>
              <span className={layer.visible ? 'layer-name' : 'layer-name dimmed'}>
                {layer.name}
              </span>
              <span className="layer-count">{countOf(world, layer)}</span>
              <button
                className={layer.visible ? 'icon-btn' : 'icon-btn off'}
                onClick={() => setProperty(layer, 'visible', !layer.visible)}
                title={layer.visible ? 'Ocultar camada' : 'Mostrar camada'}
              >
                👁
              </button>
              <button
                className={layer.locked ? 'icon-btn locked' : 'icon-btn'}
                onClick={() => setProperty(layer, 'locked', !layer.locked)}
                title={layer.locked ? 'Destravar camada' : 'Travar camada'}
              >
                {layer.locked ? '🔒' : '🔓'}
              </button>
            </div>
            {isOpen && matches.length > 0 && (
              <ul className="outliner-children">
                {matches.slice(0, 50).map((child, index) => (
                  <li key={`${layer.id}-${index}`}>{child}</li>
                ))}
                {matches.length > 50 && <li className="dimmed">… +{matches.length - 50}</li>}
              </ul>
            )}
          </div>
        );
      })}
    </aside>
  );
}
