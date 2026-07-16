import type { ValidationIssue, WorldData } from '../../core';

/**
 * Interface de exportadores (README §9).
 *
 * O módulo que justifica o produto — e NENHUM exportador pode influenciar o
 * modelo de dados: exportadores leem o WorldData e produzem arquivos, nada
 * flui na direção contrária (D1).
 */

export interface ExportFile {
  /** caminho relativo dentro do pacote exportado */
  path: string;
  data: Uint8Array;
}

export interface ExportBundle {
  files: ExportFile[];
  /** avisos para o usuário (ex.: "grid reamostrado para 4033²") */
  notes: string[];
}

export interface Exporter<TOptions = void> {
  /** "unreal5", "unity6", "godot4" */
  readonly id: string;
  readonly displayName: string;

  /** roda ANTES do export; erros bloqueiam */
  validate(world: WorldData): ValidationIssue[];

  export(world: WorldData, options?: TOptions): Promise<ExportBundle>;
}
