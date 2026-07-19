import type { WorldData } from '../../core';
import type { Camera2D } from '../Camera2D';
import type { ScatterTileCache } from '../ScatterTileCache';

/**
 * Objetos no Canvas 2D (README §6, camada 7): ícones com CULLING por tela e
 * LOD por zoom. Vegetação procedural só aparece de perto e é subamostrada
 * conforme o zoom — o dado continua sendo regra + seed (§4.7).
 */

/** vegetação some acima deste zoom (m/px) */
const VEGETATION_MAX_MPP = 5;
/** objetos manuais somem acima deste zoom */
const OBJECTS_MAX_MPP = 60;

export class ObjectOverlay {
  constructor(
    private readonly world: WorldData,
    private readonly scatter: ScatterTileCache,
  ) {}

  draw(ctx: CanvasRenderingContext2D, camera: Camera2D): void {
    if (!this.world.objects.visible) return;
    const mpp = camera.metersPerPixel;
    const { width, height } = camera.viewportSize;

    // vegetação procedural (embaixo dos objetos manuais)
    if (mpp <= VEGETATION_MAX_MPP && this.world.biomes.visible) {
      this.drawVegetation(ctx, camera, width, height);
    }

    if (mpp > OBJECTS_MAX_MPP) return;
    for (const object of this.world.objects.objects) {
      const s = camera.worldToScreen(object.pos);
      if (s.x < -20 || s.y < -20 || s.x > width + 20 || s.y > height + 20) continue; // culling
      const size = Math.max(8, 3 / mpp) * object.scale.x;
      // P2-6: objetos MANUAIS ganham uma âncora de "marcador colocável" — um
      // anel na base — para não se confundirem com a vegetação GERADA pelo
      // bioma (pontos apagados, sem anel). Só o manual é individual/selecionável.
      drawAnchor(ctx, s.x, s.y);
      drawGlyph(ctx, object.type, s.x, s.y, size);
    }
  }

  private drawVegetation(
    ctx: CanvasRenderingContext2D,
    camera: Camera2D,
    width: number,
    height: number,
  ): void {
    const raster = this.world.terrain.raster;
    const res = this.world.config.terrainResolution_m;
    const tileSpan = raster.tileSize * res;
    const mpp = camera.metersPerPixel;

    const topLeft = camera.screenToWorld({ x: 0, y: 0 });
    const bottomRight = camera.screenToWorld({ x: width, y: height });
    const tx0 = Math.max(0, Math.floor(topLeft.x / tileSpan));
    const tx1 = Math.min(raster.tilesX - 1, Math.floor(bottomRight.x / tileSpan));
    const ty0 = Math.max(0, Math.floor(bottomRight.y / tileSpan));
    const ty1 = Math.min(raster.tilesY - 1, Math.floor(topLeft.y / tileSpan));

    // LOD: subamostra pelo zoom — de perto desenha tudo, de longe 1 em N
    const step = Math.max(1, Math.round(mpp * mpp));

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const instances = this.scatter.getTile(tx, ty);
        for (let i = 0; i < instances.length; i += step) {
          const inst = instances[i];
          const s = camera.worldToScreen(inst);
          if (s.x < -8 || s.y < -8 || s.x > width + 8 || s.y > height + 8) continue;
          const radius = Math.max(1, (2.2 * inst.scale) / mpp);
          ctx.fillStyle = vegetationColor(inst.type);
          ctx.beginPath();
          ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}

// vegetação GERADA (P2-6): mais apagada que os objetos manuais — é ambiente
// procedural, não marcadores individuais.
function vegetationColor(type: string): string {
  if (type.includes('pine')) return 'rgba(31, 84, 56, 0.6)';
  if (type.includes('oak')) return 'rgba(56, 102, 65, 0.6)';
  if (type.includes('bush')) return 'rgba(108, 140, 72, 0.55)';
  return 'rgba(74, 103, 65, 0.55)';
}

/** Âncora de objeto manual: anel fino que sinaliza "marcador colocável". */
function drawAnchor(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.stroke();
}

/** Ícone simples por tipo de objeto manual. */
function drawGlyph(
  ctx: CanvasRenderingContext2D,
  type: string,
  x: number,
  y: number,
  size: number,
): void {
  const s = Math.min(22, size);
  if (type.includes('tree') || type.includes('pine') || type.includes('bush')) {
    ctx.fillStyle = '#2f7a4c';
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.7, y + s * 0.6);
    ctx.lineTo(x - s * 0.7, y + s * 0.6);
    ctx.closePath();
    ctx.fill();
  } else if (type.includes('rock')) {
    ctx.fillStyle = '#8d99ae';
    ctx.beginPath();
    ctx.arc(x, y, s * 0.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (type.includes('house') || type.includes('tower') || type.includes('building')) {
    ctx.fillStyle = '#b08960';
    ctx.fillRect(x - s * 0.55, y - s * 0.55, s * 1.1, s * 1.1);
    ctx.strokeStyle = '#5c4632';
    ctx.lineWidth = 1.25;
    ctx.strokeRect(x - s * 0.55, y - s * 0.55, s * 1.1, s * 1.1);
  } else {
    ctx.fillStyle = '#e8e6df';
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.7);
    ctx.lineTo(x + s * 0.7, y);
    ctx.lineTo(x, y + s * 0.7);
    ctx.lineTo(x - s * 0.7, y);
    ctx.closePath();
    ctx.fill();
  }
}
