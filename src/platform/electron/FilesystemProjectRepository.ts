import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AUTOSAVE_SLOTS,
  type AutosaveRecord,
  type ProjectRepository,
  type ProjectSummary,
} from '../ProjectRepository';

/**
 * Storage da Steam/desktop (README §10.2): filesystem local, projetos
 * ilimitados. Layout em `rootDir`:
 *
 *   projects/<id>.wmap        (id = nome saneado; o nome real vai no .meta)
 *   projects/<id>.meta.json   { name, savedAt }
 *   autosave/slot-<n>.wmap + slot-<n>.meta.json (3 slots rotativos, §8)
 *
 * Roda no processo MAIN do Electron (a UI fala com ele por IPC quando o
 * shell for empacotado); em teste roda em Node puro.
 */
export class FilesystemProjectRepository implements ProjectRepository {
  constructor(private readonly rootDir: string) {}

  private get projectsDir() {
    return join(this.rootDir, 'projects');
  }

  private get autosaveDir() {
    return join(this.rootDir, 'autosave');
  }

  async list(): Promise<ProjectSummary[]> {
    const entries = await readdirSafe(this.projectsDir);
    const summaries: ProjectSummary[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.wmap')) continue;
      const id = entry.slice(0, -'.wmap'.length);
      const meta = await this.readMeta(join(this.projectsDir, `${id}.meta.json`));
      const info = await stat(join(this.projectsDir, entry));
      summaries.push({
        id,
        name: meta?.name ?? id,
        savedAt: meta?.savedAt ?? info.mtimeMs,
        size: info.size,
      });
    }
    return summaries.sort((a, b) => b.savedAt - a.savedAt);
  }

  async load(id: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(join(this.projectsDir, `${safeId(id)}.wmap`)));
  }

  async save(id: string, name: string, bytes: Uint8Array): Promise<void> {
    await mkdir(this.projectsDir, { recursive: true });
    const base = join(this.projectsDir, safeId(id));
    await writeFile(`${base}.wmap`, bytes);
    await writeFile(`${base}.meta.json`, JSON.stringify({ name, savedAt: Date.now() }));
  }

  async remove(id: string): Promise<void> {
    const base = join(this.projectsDir, safeId(id));
    await rm(`${base}.wmap`, { force: true });
    await rm(`${base}.meta.json`, { force: true });
  }

  async writeAutosave(projectName: string, bytes: Uint8Array): Promise<void> {
    await mkdir(this.autosaveDir, { recursive: true });
    const slots = await this.readAutosaveSlots();
    let slot = 0;
    if (slots.length >= AUTOSAVE_SLOTS) {
      slot = slots.reduce((oldest, s) => (s.savedAt < oldest.savedAt ? s : oldest)).slot;
    } else {
      const used = new Set(slots.map((s) => s.slot));
      while (used.has(slot)) slot++;
    }
    const base = join(this.autosaveDir, `slot-${slot}`);
    await writeFile(`${base}.wmap`, bytes);
    await writeFile(
      `${base}.meta.json`,
      JSON.stringify({ name: projectName, savedAt: Date.now() }),
    );
  }

  async readLatestAutosave(): Promise<AutosaveRecord | null> {
    const slots = await this.readAutosaveSlots();
    if (slots.length === 0) return null;
    const newest = slots.reduce((a, b) => (b.savedAt > a.savedAt ? b : a));
    const bytes = new Uint8Array(
      await readFile(join(this.autosaveDir, `slot-${newest.slot}.wmap`)),
    );
    return { projectName: newest.name, savedAt: newest.savedAt, bytes };
  }

  private async readAutosaveSlots(): Promise<
    Array<{ slot: number; name: string; savedAt: number }>
  > {
    const entries = await readdirSafe(this.autosaveDir);
    const slots = [];
    for (const entry of entries) {
      const match = /^slot-(\d+)\.meta\.json$/.exec(entry);
      if (!match) continue;
      const meta = await this.readMeta(join(this.autosaveDir, entry));
      if (meta) slots.push({ slot: Number(match[1]), ...meta });
    }
    return slots;
  }

  private async readMeta(path: string): Promise<{ name: string; savedAt: number } | null> {
    try {
      return JSON.parse(await readFile(path, 'utf-8')) as { name: string; savedAt: number };
    } catch {
      return null;
    }
  }
}

async function readdirSafe(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

/** nome de arquivo seguro e estável a partir do id (v1: id = nome do projeto) */
function safeId(id: string): string {
  return id.replace(/[^\p{L}\p{N}_-]+/gu, '_');
}
