import { describe, expect, it } from 'vitest';
import { licenseFromJwt, WebLicenseProvider } from './WebLicenseProvider';

const NOW = 1_800_000_000_000;

/** JWT de teste (payload real, assinatura falsa — o cliente não a verifica). */
function makeJwt(payload: Record<string, unknown>): string {
  const b64url = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'none' })}.${b64url(payload)}.assinatura`;
}

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const okFetch = (payload: Record<string, unknown>) =>
  (() =>
    Promise.resolve(
      new Response(JSON.stringify({ token: makeJwt(payload) }), { status: 200 }),
    )) as typeof fetch;

const downFetch = (() => Promise.reject(new Error('offline'))) as typeof fetch;

const validPayload = {
  plan: 'web-subscription',
  majorVersion: 1,
  entitlements: [],
  exp: (NOW + 3_600_000) / 1000,
};

describe('WebLicenseProvider (JWT + graça offline — §10.2)', () => {
  it('sem endpoint: licença dev, sempre válida e marcada', async () => {
    const status = await new WebLicenseProvider({ now: () => NOW }).getLicense();
    expect(status.ok).toBe(true);
    if (status.ok) expect(status.license.entitlements).toContain('dev');
  });

  it('endpoint ok: decodifica o JWT e valida', async () => {
    const provider = new WebLicenseProvider({
      endpoint: 'https://api.exemplo/license',
      fetchFn: okFetch(validPayload),
      storage: makeStorage(),
      now: () => NOW,
    });
    const status = await provider.getLicense();
    expect(status.ok).toBe(true);
    if (status.ok) {
      expect(status.license.plan).toBe('web-subscription');
      expect(status.offline).toBeUndefined();
    }
  });

  it('servidor fora + cache dentro da graça: segue offline', async () => {
    const storage = makeStorage();
    let now = NOW;
    const online = new WebLicenseProvider({
      endpoint: 'https://api.exemplo/license',
      fetchFn: okFetch(validPayload),
      storage,
      now: () => now,
    });
    await online.getLicense(); // popula o cache

    now += 60_000; // 1 min depois, sem rede
    const offline = new WebLicenseProvider({
      endpoint: 'https://api.exemplo/license',
      fetchFn: downFetch,
      storage,
      now: () => now,
    });
    const status = await offline.getLicense();
    expect(status.ok).toBe(true);
    if (status.ok) expect(status.offline).toBe(true);
  });

  it('servidor fora + graça estourada: bloqueia', async () => {
    const storage = makeStorage();
    let now = NOW;
    await new WebLicenseProvider({
      endpoint: 'https://api.exemplo/license',
      fetchFn: okFetch({ ...validPayload, exp: (NOW + 30 * 86_400_000) / 1000 }),
      storage,
      now: () => now,
    }).getLicense();

    now += 8 * 24 * 60 * 60 * 1000; // 8 dias (graça padrão: 7)
    const status = await new WebLicenseProvider({
      endpoint: 'https://api.exemplo/license',
      fetchFn: downFetch,
      storage,
      now: () => now,
    }).getLicense();
    expect(status.ok).toBe(false);
  });

  it('assinatura expirada no próprio JWT: bloqueia mesmo com servidor ok', async () => {
    const status = await new WebLicenseProvider({
      endpoint: 'https://api.exemplo/license',
      fetchFn: okFetch({ ...validPayload, exp: (NOW - 1000) / 1000 }),
      storage: makeStorage(),
      now: () => NOW,
    }).getLicense();
    expect(status.ok).toBe(false);
    if (!status.ok) expect(status.reason).toMatch(/expirada/i);
  });

  it('licenseFromJwt rejeita token malformado ou sem plano', () => {
    expect(() => licenseFromJwt('abc')).toThrow(/malformado/);
    expect(() => licenseFromJwt(makeJwt({ foo: 1 }))).toThrow(/plano/);
  });
});
