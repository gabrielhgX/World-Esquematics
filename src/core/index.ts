/**
 * API pública do core (README §13).
 *
 * ZERO imports de UI, DOM ou engine. Teste de sanidade: este módulo deve
 * importar e rodar em Node.js puro (ver core-boundary.test.ts).
 */
export * from './world/WorldConfig';
export * from './world/conversions';
export * from './world/Layer';
export { LayerStack } from './world/LayerStack';
export { WorldData } from './world/WorldData';
export { TerrainLayer } from './layers/TerrainLayer';
export * from './layers/WaterLayer';
export * from './layers/RoadLayer';
export * from './layers/RegionLayer';
export * from './layers/POILayer';
export * from './layers/BiomeLayer';
export * from './layers/ObjectLayer';
export * from './geometry/polygon';
export * from './geometry/bezier';
export * from './geometry/planarGraph';
export { rasterizePolygon } from './geometry/rasterize';
export * from './raster/TiledRaster';
export * from './raster/kernels';
export { resampleBicubicU16 } from './raster/resample';
export { TsRasterKernels } from './raster/kernelsTs';
export * from './commands/Command';
export { History, DEFAULT_HISTORY_BUDGET_BYTES } from './commands/History';
export { CommandBus, type CommandBusEvents } from './commands/CommandBus';
export { SculptCommand } from './commands/SculptCommand';
export * from './commands/waterCommands';
export { RoadGraphCommand } from './commands/roadCommands';
export * from './commands/vectorCommands';
export * from './commands/biomeCommands';
export * from './derived/roadGrade';
export { BiomeRasterCache } from './derived/BiomeRasterCache';
export * from './derived/scatter';
export * from './derived/contours';
export { ContourCache } from './derived/ContourCache';
export * from './derived/floodFill';
export * from './derived/d8flow';
export { WaterSurfaceCache } from './derived/WaterSurfaceCache';
export { EventEmitter } from './utils/EventEmitter';
export { newId } from './utils/id';
