import { deriveGrid, type ValidationIssue, type WorldData } from '../../../core';
import { encodeGrayPng8 } from '../../png/png';
import type { ExportBundle, ExportFile, Exporter } from '../Exporter';
import { buildLandscapePlan } from './heightmap';
import { computeBiomeWeightmaps } from './biomeWeights';
import { exportManualObjects, exportScatterCsv, SCATTER_CSV_HEADER } from './unrealObjects';
import { exportMetadata, exportRoadSplines, exportWater } from './unrealVectors';
import { nearestLandscapeSize, UNREAL_LANDSCAPE_SIZES } from './landscapeSizes';

/**
 * Exportador Unreal COMPLETO (README §9.1, Fase 6):
 *
 * | heightmap.r16             | uint16 LE, linha 0 = norte (gotchas #1–#3) |
 * | weightmaps/<bioma>.png    | 1 PNG 8-bit por bioma, com feather (§4.4)  |
 * | objects.json              | objetos manuais (fidelidade total)         |
 * | scatter.csv               | vegetação materializada (type,x,y,z,yaw,s) |
 * | splines.json              | grafo de estradas → Landscape Splines      |
 * | water.json                | mar/lagos/rios com cotas (Water Body)      |
 * | metadata.json             | regiões e POIs                             |
 * | unreal_import.json        | manifest que o plugin importador lê        |
 *
 * Nenhum exportador influencia o modelo de dados (D1): tudo aqui LÊ o
 * WorldData e escreve arquivos.
 */
export class UnrealExporter implements Exporter {
  readonly id = 'unreal5';
  readonly displayName = 'Unreal Engine 5';

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
    for (const river of world.water.rivers) {
      for (let i = 1; i < river.nodes.length; i++) {
        if (river.nodes[i].surface_m > river.nodes[i - 1].surface_m) {
          issues.push({
            severity: 'warning',
            message: `Rio ${river.id}: cota sobe ao longo do fluxo — confira antes de importar.`,
          });
          break;
        }
      }
    }
    return issues;
  }

  async export(world: WorldData): Promise<ExportBundle> {
    const { config } = world;
    const encoder = new TextEncoder();
    const json = (value: unknown) => encoder.encode(JSON.stringify(value, null, 2));
    const notes: string[] = [];
    const files: ExportFile[] = [];

    // 1. Landscape (heightmap + escalas — gotchas #1–#3)
    const landscape = buildLandscapePlan(world);
    files.push({ path: 'heightmap.r16', data: landscape.r16 });
    if (landscape.resampled) {
      const grid = deriveGrid(config);
      notes.push(
        `Grid ${grid.widthCells}×${grid.heightCells} reamostrado para ` +
          `${landscape.resolutionX}×${landscape.resolutionY}.`,
      );
    }
    notes.push(
      `Landscape ${landscape.resolutionX}×${landscape.resolutionY} · ` +
        `ZScale ${landscape.scale.z.toFixed(2)} · ` +
        `LocationZ ${(landscape.location.z / 100).toFixed(1)} m · ` +
        `escala XY ${(landscape.scale.x / 100).toFixed(2)} m/quad.`,
    );
    // P1-7: quads fracionários funcionam, mas complicam tiling de material
    const res = config.terrainResolution_m;
    if (Math.abs(landscape.scale.x / 100 - res) > 1e-9) {
      notes.push(
        `Dica: extensão de ${landscape.resolutionX * res} m @ ${res} m/célula cai exata ` +
          `no Landscape ${landscape.resolutionX} (quads redondos de ${res} m).`,
      );
    }

    // 2. Weightmaps (1 PNG 8-bit por bioma, feather aplicado)
    const weightmaps = computeBiomeWeightmaps(world, landscape.resolutionX, landscape.resolutionY);
    const weightmapIndex = [];
    for (const { biome, pixels } of weightmaps) {
      const file = `weightmaps/${safeName(biome.name)}.png`;
      files.push({
        path: file,
        data: await encodeGrayPng8(pixels, landscape.resolutionX, landscape.resolutionY),
      });
      weightmapIndex.push({
        biomeId: biome.id,
        name: biome.name,
        file,
        materials: biome.materials,
      });
    }

    // 3. Objetos manuais + vegetação materializada (determinística)
    const manualObjects = exportManualObjects(world);
    const scatter = exportScatterCsv(world);
    files.push({
      path: 'objects.json',
      data: json({ format: 'uu; yaw canhoto; z = terreno + z_offset', objects: manualObjects }),
    });
    files.push({ path: 'scatter.csv', data: encoder.encode(scatter.csv) });
    if (scatter.count > 0) {
      notes.push(`${scatter.count} instâncias de vegetação materializadas em scatter.csv.`);
    }

    // 4. Estradas, água, regiões/POIs
    const roads = exportRoadSplines(world);
    files.push({ path: 'splines.json', data: json(roads) });
    files.push({ path: 'water.json', data: json(exportWater(world)) });
    files.push({ path: 'metadata.json', data: json(exportMetadata(world)) });

    // 5. Manifest para o plugin importador
    const manifest = {
      exporter: this.id,
      formatVersion: 2,
      source: {
        projectName: config.projectName,
        extent_m: config.extent,
        terrainResolution_m: config.terrainResolution_m,
        heightRange_m: config.heightRange,
      },
      landscape: {
        heightmapFile: 'heightmap.r16',
        heightmapFormat: 'uint16 little-endian, linhas norte→sul, colunas oeste→leste',
        resolutionX: landscape.resolutionX,
        resolutionY: landscape.resolutionY,
        scale: landscape.scale,
        location: landscape.location,
      },
      weightmaps: weightmapIndex,
      files: {
        objects: 'objects.json',
        scatter: 'scatter.csv',
        splines: 'splines.json',
        water: 'water.json',
        metadata: 'metadata.json',
      },
      counts: {
        manualObjects: manualObjects.length,
        scatterInstances: scatter.count,
        roadSplines: roads.splines.length,
        lakes: world.water.lakes.length,
        rivers: world.water.rivers.length,
        regions: world.regions.regions.length,
        pois: world.pois.pois.length,
      },
      scatterCsvHeader: SCATTER_CSV_HEADER,
      axes: {
        canonical: 'X=Leste, Y=Norte, Z=Cima (destro) — README D10',
        conversion:
          'Unreal é Z-up canhoto: flip do eixo N-S (linha 0 do heightmap = norte; ' +
          'y_uu = (extentNS − y)·100) e yaw com sinal invertido. ' +
          'Validado com o mapa "L" assimétrico.',
      },
      engineNote:
        'Valores para o Landscape padrão (ZScale 100 ≙ ±256 m; escala 100 ≙ 1 m/quad). ' +
        'Confirmar tabela de resoluções e fórmula do ZScale na doc da versão exata da ' +
        'engine alvo (README §9.1).',
    };
    files.push({ path: 'unreal_import.json', data: json(manifest) });

    return { files, notes };
  }
}

function safeName(name: string): string {
  return name.replace(/[^\p{L}\p{N}_-]+/gu, '_');
}
