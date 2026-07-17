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
  /**
   * Fluxo contínuo (pincéis): chamado a cada frame ENQUANTO o botão está
   * pressionado, mesmo com o mouse parado — estilo Photoshop/Blender.
   * `dt_ms` é o tempo desde o último frame; a ferramenta decide o ritmo.
   */
  onHold?(dt_ms: number): void;
  /** preview do pincel, guias — desenhado por cima dos vetores */
  drawOverlay(ctx: CanvasRenderingContext2D): void;
  /** teclas sem modificador (Enter/Escape…); true = consumida */
  onKeyDown?(key: string): boolean;
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
