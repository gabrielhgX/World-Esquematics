import {
  AUTOSAVE_SLOTS,
  type AutosaveRecord,
  type ProjectRepository,
  type ProjectSummary,
} from '../ProjectRepository';

/**
 * Storage da web (README §10.2): IndexedDB. Duas stores no mesmo banco —
 * 'projects' (save/load nomeado) e 'autosave' (3 slots rotativos, §8).
 * A store 'autosave' é a mesma da Fase 5; a v2 do banco só ACRESCENTA a
 * 'projects' (upgrade preserva os dados).
 */

const DB_NAME = 'world-esquematics';
const DB_VERSION = 2;
const PROJECTS = 'projects';
const AUTOSAVE = 'autosave';

interface ProjectRow {
  id: string;
  name: string;
  savedAt: number;
  bytes: Uint8Array;
}

interface AutosaveRow extends AutosaveRecord {
  slot: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUTOSAVE)) {
        db.createObjectStore(AUTOSAVE, { keyPath: 'slot' });
      }
      if (!db.objectStoreNames.contains(PROJECTS)) {
        db.createObjectStore(PROJECTS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function asPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await asPromise(action(db.transaction(store, mode).objectStore(store)));
  } finally {
    db.close();
  }
}

export class IndexedDbProjectRepository implements ProjectRepository {
  async list(): Promise<ProjectSummary[]> {
    const rows = (await withStore(PROJECTS, 'readonly', (s) => s.getAll())) as ProjectRow[];
    return rows
      .map(({ id, name, savedAt, bytes }) => ({ id, name, savedAt, size: bytes.length }))
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  async load(id: string): Promise<Uint8Array> {
    const row = (await withStore(PROJECTS, 'readonly', (s) => s.get(id))) as ProjectRow | undefined;
    if (!row) throw new Error(`Projeto não encontrado: ${id}`);
    return row.bytes;
  }

  async save(id: string, name: string, bytes: Uint8Array): Promise<void> {
    const row: ProjectRow = { id, name, savedAt: Date.now(), bytes };
    await withStore(PROJECTS, 'readwrite', (s) => s.put(row));
  }

  async remove(id: string): Promise<void> {
    await withStore(PROJECTS, 'readwrite', (s) => s.delete(id));
  }

  async writeAutosave(projectName: string, bytes: Uint8Array): Promise<void> {
    const rows = (await withStore(AUTOSAVE, 'readonly', (s) => s.getAll())) as AutosaveRow[];
    let slot = 0;
    if (rows.length >= AUTOSAVE_SLOTS) {
      slot = rows.reduce((oldest, r) => (r.savedAt < oldest.savedAt ? r : oldest)).slot;
    } else {
      const used = new Set(rows.map((r) => r.slot));
      while (used.has(slot)) slot++;
    }
    const row: AutosaveRow = { slot, projectName, savedAt: Date.now(), bytes };
    await withStore(AUTOSAVE, 'readwrite', (s) => s.put(row));
  }

  async readLatestAutosave(): Promise<AutosaveRecord | null> {
    try {
      const rows = (await withStore(AUTOSAVE, 'readonly', (s) => s.getAll())) as AutosaveRow[];
      if (rows.length === 0) return null;
      return rows.reduce((newest, r) => (r.savedAt > newest.savedAt ? r : newest));
    } catch {
      return null; // IndexedDB indisponível: sem autosave, sem crash
    }
  }
}
