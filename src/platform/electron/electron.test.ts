import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FilesystemProjectRepository } from './FilesystemProjectRepository';
import { SteamworksLicenseProvider } from './SteamworksLicenseProvider';

describe('SteamworksLicenseProvider (offline OK — §10.2)', () => {
  it('dono do app: licença vitalícia da major do build', async () => {
    const status = await new SteamworksLicenseProvider({ isOwned: () => true }, 1).getLicense();
    expect(status.ok).toBe(true);
    if (status.ok) {
      expect(status.license.plan).toBe('steam-lifetime');
      expect(status.license.majorVersion).toBe(1);
      expect(status.license.expiresAt).toBeUndefined(); // vitalício
    }
  });

  it('não é dono / Steam fora do ar: bloqueia com motivo claro', async () => {
    const notOwned = await new SteamworksLicenseProvider({ isOwned: () => false }, 1).getLicense();
    expect(notOwned.ok).toBe(false);
    const broken = await new SteamworksLicenseProvider(
      {
        isOwned: () => {
          throw new Error('sem steam');
        },
      },
      1,
    ).getLicense();
    expect(broken.ok).toBe(false);
  });
});

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const makeRepo = () => {
  const dir = mkdtempSync(join(tmpdir(), 'wesq-fs-'));
  dirs.push(dir);
  return new FilesystemProjectRepository(dir);
};

describe('FilesystemProjectRepository (storage da Steam — §10.2)', () => {
  it('save/list/load/remove com nome preservado', async () => {
    const repo = makeRepo();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await repo.save('Reino do Norte', 'Reino do Norte', bytes);

    const list = await repo.list();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('Reino do Norte');
    expect(list[0].size).toBe(4);

    expect([...(await repo.load(list[0].id))]).toEqual([1, 2, 3, 4]);
    await repo.remove(list[0].id);
    expect((await repo.list()).length).toBe(0);
  });

  it('autosave: 3 slots rotativos, o mais antigo é sobrescrito (§8)', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 5; i++) {
      await repo.writeAutosave(`save-${i}`, new Uint8Array([i]));
      await new Promise((resolve) => setTimeout(resolve, 5)); // savedAt distinto
    }
    const latest = await repo.readLatestAutosave();
    expect(latest?.projectName).toBe('save-4');
    expect([...(latest?.bytes ?? [])]).toEqual([4]);
    // só 3 slots vivem: os mais antigos (0 e 1) já foram rodados para fora
    const { readdirSync } = await import('node:fs');
    const files = readdirSync(join(dirs[dirs.length - 1], 'autosave'));
    expect(files.filter((f) => f.endsWith('.wmap')).length).toBe(3);
  });

  it('repositório vazio: list [] e autosave null, sem exceção', async () => {
    const repo = makeRepo();
    expect(await repo.list()).toEqual([]);
    expect(await repo.readLatestAutosave()).toBeNull();
  });
});
