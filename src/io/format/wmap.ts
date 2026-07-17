import {
  BiomeRasterCache,
  WorldData,
  type BiomeDefinition,
  type BiomePolygon,
  type Layer,
  type MapObject,
  type POI,
  type Region,
  type RiverSpline,
  type RoadEdge,
  type RoadNode,
  type WaterBody,
  type WorldConfig,
} from '../../core';
import { readZip, writeZipCompressed, type ZipEntry } from './zip';

/**
 * Formato .wmap (README §8): container ZIP, modelo de .blend/.kra.
 *
 * - manifest.json: WorldConfig + formatVersion — MIGRADORES desde a v1;
 * - layers.json: LayerStack + vetores (água, estradas, regiões, POIs, objetos);
 * - biomes.json: paleta + polígonos + scatterSeed (§4.7);
 * - terrain/tx_ty.bin: tiles uint16 LE crus (só os alocados — esparso, D4);
 * - biome_raster/tx_ty.bin: o raster uint8 materializado (o §8 o lista no
 *   container; na LEITURA os polígonos são a fonte — §4.4);
 * - thumbnail.png (opcional).
 *
 * Nada de derivado além disso: sem contornos, sem hillshade, sem profundidade.
 */

export const WMAP_FORMAT_VERSION = 1;

interface WmapManifest {
  formatVersion: number;
  config: WorldConfig;
}

type LayerMeta = Pick<Layer, 'name' | 'type' | 'visible' | 'locked' | 'opacity' | 'order'>;

interface WmapLayers {
  layers: LayerMeta[];
  terrain: { tileSize: number; baseHeight_u16: number };
  water: {
    seaLevel_m: number;
    /** ausente em arquivos antigos — ver compat no load */
    oceanEnabled?: boolean;
    oceanMaterial: string;
    lakes: WaterBody[];
    rivers: RiverSpline[];
  };
  roads: { nodes: RoadNode[]; edges: RoadEdge[] };
  regions: Region[];
  pois: POI[];
  objects: MapObject[];
}

interface WmapBiomes {
  palette: BiomeDefinition[];
  polygons: BiomePolygon[];
  scatterSeed: number;
}

/**
 * Migrador de manifest (README §8): você VAI mudar o schema. v1 é identidade;
 * versões futuras encadeiam migrações aqui.
 */
export function migrateManifest(raw: unknown): WmapManifest {
  const manifest = raw as Partial<WmapManifest>;
  if (typeof manifest?.formatVersion !== 'number' || !manifest.config) {
    throw new Error('manifest.json inválido — o arquivo não parece ser um .wmap.');
  }
  if (manifest.formatVersion > WMAP_FORMAT_VERSION) {
    throw new Error(
      `Este projeto foi salvo numa versão mais nova do formato ` +
        `(v${manifest.formatVersion} > v${WMAP_FORMAT_VERSION}). Atualize o editor.`,
    );
  }
  // v1 → v1: identidade. Migrações v1→v2, v2→v3… entram aqui, em cadeia.
  return manifest as WmapManifest;
}

/** Serializa o mundo para os bytes do container .wmap. */
export async function saveWmap(
  world: WorldData,
  options: { thumbnailPng?: Uint8Array } = {},
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const json = (value: unknown) => encoder.encode(JSON.stringify(value));
  const entries: ZipEntry[] = [];

  const manifest: WmapManifest = { formatVersion: WMAP_FORMAT_VERSION, config: world.config };
  entries.push({ path: 'manifest.json', data: json(manifest) });

  const layerMeta = (layer: Layer): LayerMeta => ({
    name: layer.name,
    type: layer.type,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    order: layer.order,
  });
  const layers: WmapLayers = {
    layers: world.layers.inOrder().map(layerMeta),
    terrain: {
      tileSize: world.terrain.raster.tileSize,
      baseHeight_u16: world.terrain.baseHeight_u16,
    },
    water: {
      seaLevel_m: world.water.seaLevel_m,
      oceanEnabled: world.water.oceanEnabled,
      oceanMaterial: world.water.ocean.material,
      lakes: [...world.water.lakes],
      rivers: [...world.water.rivers],
    },
    roads: {
      nodes: [...world.roads.nodes.values()],
      edges: [...world.roads.edges.values()],
    },
    regions: [...world.regions.regions],
    pois: [...world.pois.pois],
    objects: [...world.objects.objects],
  };
  entries.push({ path: 'layers.json', data: json(layers) });

  const biomes: WmapBiomes = {
    palette: world.biomes.palette,
    polygons: [...world.biomes.polygons],
    scatterSeed: world.biomes.scatterSeed,
  };
  entries.push({ path: 'biomes.json', data: json(biomes) });

  // tiles do relevo: uint16 little-endian explícito (determinístico)
  for (const [key, tile] of world.terrain.raster.allocatedTiles()) {
    entries.push({ path: `terrain/${key.replace(',', '_')}.bin`, data: u16ToBytesLE(tile) });
  }

  // raster de biomas materializado (listado no §8; a fonte são os polígonos)
  if (world.biomes.polygons.length > 0) {
    const grid = world.terrain.raster;
    const cache = new BiomeRasterCache(
      grid.widthCells,
      grid.heightCells,
      world.config.terrainResolution_m,
    );
    cache.sync(world.biomes);
    for (const [key, tile] of cache.biomeRaster.allocatedTiles()) {
      entries.push({ path: `biome_raster/${key.replace(',', '_')}.bin`, data: tile.slice() });
    }
  }

  if (options.thumbnailPng) {
    entries.push({ path: 'thumbnail.png', data: options.thumbnailPng });
  }

  return writeZipCompressed(entries);
}

/** Reconstrói o WorldData a partir dos bytes de um .wmap. */
export async function loadWmap(bytes: Uint8Array): Promise<WorldData> {
  const entries = await readZip(bytes);
  const byPath = new Map(entries.map((entry) => [entry.path, entry.data]));
  const decoder = new TextDecoder();
  const readJson = <T>(path: string): T => {
    const data = byPath.get(path);
    if (!data) throw new Error(`Entrada obrigatória ausente no .wmap: ${path}`);
    return JSON.parse(decoder.decode(data)) as T;
  };

  const manifest = migrateManifest(readJson<unknown>('manifest.json'));
  const world = new WorldData(manifest.config);
  const layers = readJson<WmapLayers>('layers.json');
  const biomes = readJson<WmapBiomes>('biomes.json');

  // metadados das camadas (por tipo — ids são internos e renascem no load)
  for (const meta of layers.layers) {
    const layer = world.layers.getByType(meta.type)[0];
    if (!layer) continue;
    layer.name = meta.name;
    layer.visible = meta.visible;
    layer.locked = meta.locked;
    layer.opacity = meta.opacity;
    layer.order = meta.order;
  }

  // relevo: só os tiles alocados (esparso)
  for (const [path, data] of byPath) {
    const match = /^terrain\/(\d+)_(\d+)\.bin$/.exec(path);
    if (!match) continue;
    world.terrain.raster.setTileData(Number(match[1]), Number(match[2]), bytesLEToU16(data));
  }

  world.water.setSeaLevel(layers.water.seaLevel_m);
  // compat: arquivos de antes do flag — mar mexido pelo usuário fica ligado
  world.water.setOceanEnabled(layers.water.oceanEnabled ?? layers.water.seaLevel_m !== 0);
  world.water.ocean.material = layers.water.oceanMaterial;
  for (const lake of layers.water.lakes) world.water.addBody(lake);
  for (const river of layers.water.rivers) world.water.addRiver(river);

  for (const node of layers.roads.nodes) world.roads.addNode(node);
  for (const edge of layers.roads.edges) world.roads.addEdge(edge);

  for (const region of layers.regions) world.regions.add(region);
  for (const poi of layers.pois) world.pois.add(poi);
  for (const object of layers.objects) world.objects.add(object);

  world.biomes.setPalette(biomes.palette);
  world.biomes.scatterSeed = biomes.scatterSeed;
  for (const polygon of biomes.polygons) world.biomes.addPolygon(polygon);
  // biome_raster/* é cache materializado — ignorado: os polígonos são a fonte

  return world;
}

function u16ToBytesLE(tile: Uint16Array): Uint8Array {
  const bytes = new Uint8Array(tile.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < tile.length; i++) view.setUint16(i * 2, tile[i], true);
  return bytes;
}

function bytesLEToU16(bytes: Uint8Array): Uint16Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tile = new Uint16Array(bytes.length / 2);
  for (let i = 0; i < tile.length; i++) tile[i] = view.getUint16(i * 2, true);
  return tile;
}
