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
export * from './raster/TiledRaster';
export * from './commands/Command';
export { History, DEFAULT_HISTORY_BUDGET_BYTES } from './commands/History';
export { CommandBus, type CommandBusEvents } from './commands/CommandBus';
export { EventEmitter } from './utils/EventEmitter';
export { newId } from './utils/id';
