import type { RoadType, WorldData } from '../../core';
import type { Camera2D } from '../Camera2D';

/**
 * Vetores no Canvas 2D (README §6, camadas 5–7): estradas (splines do grafo
 * planar), regiões (polígonos nomeados) e POIs (ícones). Só lê o WorldData.
 */

const ROAD_STYLES: Record<RoadType, { color: string; dash?: number[] }> = {
  trail: { color: '#a89a7c', dash: [4, 4] },
  dirt: { color: '#9c8666' },
  gravel: { color: '#a7a7a2' },
  asphalt: { color: '#4d5157' },
  highway: { color: '#3c4046' },
  bridge: { color: '#6b6f76' },
};

export class VectorOverlay {
  constructor(private readonly world: WorldData) {}

  draw(ctx: CanvasRenderingContext2D, camera: Camera2D): void {
    this.drawRoads(ctx, camera);
    this.drawRegions(ctx, camera);
    this.drawPOIs(ctx, camera);
  }

  private drawRoads(ctx: CanvasRenderingContext2D, camera: Camera2D): void {
    const roads = this.world.roads;
    if (!roads.visible || roads.edges.size === 0) return;
    const mpp = camera.metersPerPixel;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const edge of roads.edges.values()) {
      const from = roads.getNode(edge.from);
      const to = roads.getNode(edge.to);
      if (!from || !to) continue;
      const p0 = camera.worldToScreen(from.pos);
      const c1 = camera.worldToScreen(edge.c1);
      const c2 = camera.worldToScreen(edge.c2);
      const p1 = camera.worldToScreen(to.pos);
      const style = ROAD_STYLES[edge.type];
      const width = Math.max(1.5, edge.width_m / mpp);

      // ponte: casing claro por baixo (trecho que ignora o relevo — §4.5)
      if (edge.type === 'bridge') {
        ctx.strokeStyle = '#d8dade';
        ctx.lineWidth = width + 3;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p1.x, p1.y);
        ctx.stroke();
      }

      ctx.strokeStyle = style.color;
      ctx.lineWidth = width;
      ctx.setLineDash(style.dash ?? []);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p1.x, p1.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // nós do grafo visíveis de perto (interseções em destaque)
    if (mpp < 8) {
      for (const node of roads.nodes.values()) {
        const s = camera.worldToScreen(node.pos);
        ctx.fillStyle = node.kind === 'intersection' ? '#ffd166' : '#c9ccd1';
        ctx.beginPath();
        ctx.arc(s.x, s.y, node.kind === 'intersection' ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawRegions(ctx: CanvasRenderingContext2D, camera: Camera2D): void {
    const layer = this.world.regions;
    if (!layer.visible || layer.regions.length === 0) return;

    for (const region of layer.regions) {
      if (region.polygon.length < 3) continue;
      ctx.beginPath();
      region.polygon.forEach(([x, y], i) => {
        const s = camera.worldToScreen({ x, y });
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.fillStyle = `${region.color}26`;
      ctx.fill();
      ctx.strokeStyle = region.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // rótulo no centroide
      let cx = 0;
      let cy = 0;
      for (const [x, y] of region.polygon) {
        cx += x;
        cy += y;
      }
      const centroid = camera.worldToScreen({
        x: cx / region.polygon.length,
        y: cy / region.polygon.length,
      });
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 3;
      ctx.strokeText(region.name, centroid.x, centroid.y);
      ctx.fillStyle = '#f0eef4';
      ctx.fillText(region.name, centroid.x, centroid.y);
      ctx.textAlign = 'start';
    }
  }

  private drawPOIs(ctx: CanvasRenderingContext2D, camera: Camera2D): void {
    const layer = this.world.pois;
    if (!layer.visible || layer.pois.length === 0) return;

    for (const poi of layer.pois) {
      const s = camera.worldToScreen(poi.pos);
      ctx.fillStyle = 'rgba(20, 22, 24, 0.85)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e8c468';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e8c468';
      ctx.fillText(poi.icon, s.x, s.y + 0.5);
      // nome ao lado, com halo
      ctx.textAlign = 'start';
      ctx.textBaseline = 'middle';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 3;
      ctx.strokeText(poi.name, s.x + 13, s.y);
      ctx.fillStyle = '#f2ead3';
      ctx.fillText(poi.name, s.x + 13, s.y);
    }
    ctx.textBaseline = 'alphabetic';
  }
}
