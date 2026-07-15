import { CommandBus, History, WorldData, type WorldConfig } from '../core';

/**
 * Composição de um projeto aberto: a verdade (WorldData) + a única porta de
 * escrita (CommandBus + History). A UI referencia a sessão, nunca cria
 * atalhos para mutar o WorldData diretamente (README §2).
 */
export interface ProjectSession {
  world: WorldData;
  history: History;
  bus: CommandBus;
}

export function createProjectSession(config: WorldConfig): ProjectSession {
  const world = new WorldData(config);
  const history = new History();
  const bus = new CommandBus(world, history);
  return { world, history, bus };
}
