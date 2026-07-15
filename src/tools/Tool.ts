import type { CommandBus, RasterKernels, WorldData } from '../core';
import type { Camera2D, Vec2 } from '../render/Camera2D';

/**
 * Interface de ferramentas (README §7).
 * Ferramentas NUNCA escrevem no WorldData direto — só emitem Commands.
 */

export interface Modifiers {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

export interface Tool {
  onPointerDown(pt: Vec2, mods: Modifiers): void;
  onPointerMove(pt: Vec2): void;
  onPointerUp(): void;
  /** preview do pincel, guias — desenhado por cima dos vetores */
  drawOverlay(ctx: CanvasRenderingContext2D): void;
  readonly cursor: string;
}

/** Dependências injetadas nas ferramentas. */
export interface ToolContext {
  /** leitura apenas — escrita é sempre via bus */
  world: WorldData;
  bus: CommandBus;
  camera: Camera2D;
  /** kernels atrás de interface (README §10.1): TS hoje, WASM amanhã */
  kernels: RasterKernels;
  requestRender(): void;
}
