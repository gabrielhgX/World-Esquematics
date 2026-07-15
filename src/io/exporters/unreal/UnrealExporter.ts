import {
  deriveGrid,
  resampleBicubicU16,
  type ValidationIssue,
  type WorldData,
} from '../../../core';
import type { ExportBundle, Exporter } from '../Exporter';
import { nearestLandscapeSize, UNREAL_LANDSCAPE_SIZES } from './landscapeSizes';

/**
 * Exportador Unreal mínimo — "feio mas funcional" (README §11, ordem 0→1→6):
 * só o heightmap, para pagar cedo os três gotchas do §9.1.
 *
 * Gotcha #1 — resolução travada: reamostra (bicúbico) o grid para o tamanho
 *   válido mais próximo da tabela do Landscape e informa o usuário.
 *
 * Gotcha #2 — escala Z: com Landscape ZScale = 100, o uint16 mapeia para
 *   ±256 m (512 m totais). Para um heightRange de S metros:
 *     ZScale     = S / 512 × 100
 *     LocationZ  = min_m + 256 × (ZScale / 100)   [metros → ×100 em UE units]
 *   Verificação: h16=0 → min_m; h16=65535 → max_m. Fórmula a confirmar na
 *   doc da versão alvo (README §9.1) quando o plugin importador (Fase 6)
 *   fechar a versão da engine.
 *
 * Gotcha #3 — eixos: nosso espaço canônico é Z-up DESTRO (X=Leste, Y=Norte);
 *   a Unreal é Z-up CANHOTA. A conversão é uma inversão de eixo: o heightmap
 *   sai com a LINHA 0 = NORTE (flip vertical do raster, cuja linha 0 é o
 *   sul). Validado pelo teste do mapa "L" assimétrico.
 */
export class UnrealExporter implements Exporter {
  readonly id = 'unreal5';
  readonly displayName = 'Unreal Engine 5 (heightmap)';

  validate(world: WorldData): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const grid = deriveGrid(world.config);
    const dstW = nearestLandscapeSize(grid.widthCells);
    const dstH = nearestLandscapeSize(grid.heightCells);

    if (dstW !== grid.widthCells || dstH !== grid.heightCells) {
      issues.push({
        severity: 'warning',
        message:
          `O Landscape só aceita resoluções fixas (${UNREAL_LANDSCAPE_SIZES.join(', ')}): ` +
          `o grid ${grid.widthCells}×${grid.heightCells} será reamostrado ` +
          `(bicúbico) para ${dstW}×${dstH}.`,
      });
    }
    if (grid.widthCells !== grid.heightCells) {
      issues.push({
        severity: 'warning',
        message: 'Mundo não quadrado: confira o suporte a Landscape retangular na engine alvo.',
      });
    }
    return issues;
  }

  export(world: WorldData): Promise<ExportBundle> {
    const { config } = world;
    const raster = world.terrain.raster;
    const grid = deriveGrid(config);
    const dstW = nearestLandscapeSize(grid.widthCells);
    const dstH = nearestLandscapeSize(grid.heightCells);
    const notes: string[] = [];

    // 1. Materializa e reamostra para a resolução válida (gotcha #1).
    const dense = raster.toDense((n) => new Uint16Array(n));
    const resampled =
      dstW === raster.widthCells && dstH === raster.heightCells
        ? dense
        : resampleBicubicU16(dense, raster.widthCells, raster.heightCells, dstW, dstH);
    if (resampled !== dense) {
      notes.push(`Grid ${grid.widthCells}×${grid.heightCells} reamostrado para ${dstW}×${dstH}.`);
    }

    // 2. Escreve o .r16 (uint16 little-endian) com flip vertical:
    //    linha 0 da imagem = NORTE (gotcha #3, destro → canhoto).
    const bytes = new Uint8Array(dstW * dstH * 2);
    const view = new DataView(bytes.buffer);
    for (let row = 0; row < dstH; row++) {
      const sourceRow = dstH - 1 - row;
      for (let col = 0; col < dstW; col++) {
        view.setUint16((row * dstW + col) * 2, resampled[sourceRow * dstW + col], true);
      }
    }

    // 3. Escalas do Landscape (gotcha #2). XY: espaçamento entre vértices em
    //    cm (escala 100 = 1 m por quad). Z: range mapeado nos ±256 m padrão.
    const span_m = config.heightRange.max_m - config.heightRange.min_m;
    const zScale = (span_m / 512) * 100;
    const locationZ_m = config.heightRange.min_m + 256 * (zScale / 100);
    const scaleX = (config.extent.width_m / (dstW - 1)) * 100;
    const scaleY = (config.extent.height_m / (dstH - 1)) * 100;

    const importManifest = {
      exporter: this.id,
      formatVersion: 1,
      engineNote:
        'Valores para o Landscape padrão (ZScale 100 ≙ ±256 m; escala 100 ≙ 1 m/quad). ' +
        'Confirmar tabela de resoluções e fórmula do ZScale na doc da versão exata da ' +
        'engine alvo (README §9.1).',
      source: {
        projectName: config.projectName,
        extent_m: config.extent,
        terrainResolution_m: config.terrainResolution_m,
        heightRange_m: config.heightRange,
        grid,
      },
      landscape: {
        heightmapFile: 'heightmap.r16',
        heightmapFormat: 'uint16 little-endian, linhas norte→sul, colunas oeste→leste',
        resolutionX: dstW,
        resolutionY: dstH,
        scale: { x: scaleX, y: scaleY, z: zScale },
        location: { x: 0, y: 0, z: locationZ_m * 100 }, // UE units (cm)
      },
      axes: {
        canonical: 'X=Leste, Y=Norte, Z=Cima (destro) — README D10',
        conversion:
          'Unreal é Z-up canhoto: heightmap exportado com flip vertical ' +
          '(linha 0 = norte). Validado com o mapa "L" assimétrico.',
      },
    };

    notes.push(
      `Landscape ${dstW}×${dstH} · ZScale ${zScale.toFixed(2)} · ` +
        `LocationZ ${locationZ_m.toFixed(1)} m · escala XY ${(scaleX / 100).toFixed(2)} m/quad.`,
    );

    const encoder = new TextEncoder();
    return Promise.resolve({
      files: [
        { path: 'heightmap.r16', data: bytes },
        {
          path: 'unreal_import.json',
          data: encoder.encode(JSON.stringify(importManifest, null, 2)),
        },
      ],
      notes,
    });
  }
}
