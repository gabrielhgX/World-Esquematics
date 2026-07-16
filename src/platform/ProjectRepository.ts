/**
 * Repositório de projetos (README §10.2): IndexedDB na web, filesystem na
 * Steam — a UI só conhece esta interface. Os bytes são SEMPRE um .wmap
 * completo (§8); o repositório não interpreta o conteúdo.
 */

export interface ProjectSummary {
  id: string;
  name: string;
  savedAt: number;
  /** tamanho do .wmap em bytes */
  size: number;
}

export interface AutosaveRecord {
  projectName: string;
  savedAt: number;
  bytes: Uint8Array;
}

export const AUTOSAVE_SLOTS = 3;
export const AUTOSAVE_INTERVAL_MS = 5 * 60 * 1000;

export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  load(id: string): Promise<Uint8Array>;
  /** grava/sobrescreve pelo id (v1: id = nome do projeto) */
  save(id: string, name: string, bytes: Uint8Array): Promise<void>;
  remove(id: string): Promise<void>;

  /** slot ROTATIVO de 3 posições (§8) — sobrescreve sempre o mais antigo */
  writeAutosave(projectName: string, bytes: Uint8Array): Promise<void>;
  readLatestAutosave(): Promise<AutosaveRecord | null>;
}
