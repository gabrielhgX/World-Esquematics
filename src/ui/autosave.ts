/**
 * Autosave em SLOT ROTATIVO de 3 posições (README §8): um crash em 4 h de
 * trabalho de mapa é um usuário perdido. Persistência em IndexedDB — o
 * Platform adapter formal (IndexedDB × filesystem) chega na Fase 7 (§10.2).
 */

const DB_NAME = 'world-esquematics';
const STORE = 'autosave';
export const AUTOSAVE_SLOTS = 3;
export const AUTOSAVE_INTERVAL_MS = 5 * 60 * 1000;

export interface AutosaveRecord {
  slot: number;
  projectName: string;
  savedAt: number;
  bytes: Uint8Array;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'slot' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function listRecords(): Promise<AutosaveRecord[]> {
  const db = await openDb();
  try {
    const store = db.transaction(STORE, 'readonly').objectStore(STORE);
    return (await requestAsPromise(store.getAll())) as AutosaveRecord[];
  } finally {
    db.close();
  }
}

/** Grava no slot mais ANTIGO (rotativo). */
export async function writeAutosave(projectName: string, bytes: Uint8Array): Promise<void> {
  const records = await listRecords();
  let slot = 0;
  if (records.length >= AUTOSAVE_SLOTS) {
    slot = records.reduce((oldest, r) => (r.savedAt < oldest.savedAt ? r : oldest)).slot;
  } else {
    const used = new Set(records.map((r) => r.slot));
    while (used.has(slot)) slot++;
  }
  const db = await openDb();
  try {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    const record: AutosaveRecord = { slot, projectName, savedAt: Date.now(), bytes };
    await requestAsPromise(store.put(record));
  } finally {
    db.close();
  }
}

/** O autosave mais recente, se houver. */
export async function readLatestAutosave(): Promise<AutosaveRecord | null> {
  try {
    const records = await listRecords();
    if (records.length === 0) return null;
    return records.reduce((newest, r) => (r.savedAt > newest.savedAt ? r : newest));
  } catch {
    return null; // IndexedDB indisponível: sem autosave, sem crash
  }
}
