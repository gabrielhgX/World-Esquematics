import { checkLicense, type License, type LicenseProvider, type LicenseStatus } from '../license';

/**
 * Licença da web (README §10.2): JWT do servidor, revalidada periodicamente
 * (quem agenda é o App; o provider é passivo).
 *
 * - o endpoint devolve { token } com payload { plan, majorVersion,
 *   entitlements, exp }; a ASSINATURA é verificada no servidor — o cliente
 *   decodifica e respeita o exp (client-side é UX, não segurança: export e
 *   nuvem validam de novo no servidor);
 * - a última licença válida fica em cache: sem rede, vale por um período de
 *   GRAÇA (padrão 7 dias) antes de bloquear;
 * - SEM endpoint configurado (dev/local): licença de desenvolvimento com
 *   validade curta, claramente marcada — o produto roda sem servidor hoje.
 */

export interface WebLicenseOptions {
  /** ex.: import.meta.env.VITE_LICENSE_ENDPOINT; ausente = modo dev */
  endpoint?: string;
  fetchFn?: typeof fetch;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  offlineGraceMs?: number;
  now?: () => number;
}

const CACHE_KEY = 'wesq.license.v1';
const DEFAULT_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const LICENSE_REVALIDATE_MS = 30 * 60 * 1000;

interface CachedLicense {
  license: License;
  fetchedAt: number;
}

export class WebLicenseProvider implements LicenseProvider {
  constructor(private readonly options: WebLicenseOptions = {}) {}

  async getLicense(): Promise<LicenseStatus> {
    const now = (this.options.now ?? Date.now)();
    if (!this.options.endpoint) {
      // modo dev: assinatura local de 24 h, renovada a cada chamada
      return checkLicense(
        {
          plan: 'web-subscription',
          majorVersion: 0,
          entitlements: ['dev'],
          expiresAt: now + 24 * 60 * 60 * 1000,
        },
        undefined,
        now,
      );
    }

    try {
      const response = await (this.options.fetchFn ?? fetch)(this.options.endpoint, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { token } = (await response.json()) as { token: string };
      const license = licenseFromJwt(token);
      this.writeCache({ license, fetchedAt: now });
      return checkLicense(license, undefined, now);
    } catch {
      // sem rede/servidor: período de graça sobre a última licença válida
      const cached = this.readCache();
      const grace = this.options.offlineGraceMs ?? DEFAULT_GRACE_MS;
      if (cached && now - cached.fetchedAt <= grace) {
        const status = checkLicense(cached.license, undefined, now);
        return status.ok ? { ...status, offline: true } : status;
      }
      return {
        ok: false,
        reason: 'Sem conexão com o servidor de licenças e sem licença válida em cache.',
      };
    }
  }

  private readCache(): CachedLicense | null {
    try {
      const raw = this.storage.getItem(CACHE_KEY);
      return raw ? (JSON.parse(raw) as CachedLicense) : null;
    } catch {
      return null;
    }
  }

  private writeCache(cache: CachedLicense): void {
    try {
      this.storage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      // storage cheio/indisponível: segue sem cache (só perde a graça offline)
    }
  }

  private get storage() {
    return this.options.storage ?? localStorage;
  }
}

/** Decodifica o payload do JWT (base64url) — validação de assinatura é do servidor. */
export function licenseFromJwt(token: string): License {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('JWT malformado.');
  const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
    plan?: License['plan'];
    majorVersion?: number;
    entitlements?: string[];
    exp?: number; // segundos, padrão JWT
  };
  if (payload.plan !== 'web-subscription' && payload.plan !== 'steam-lifetime') {
    throw new Error('JWT sem plano reconhecido.');
  }
  return {
    plan: payload.plan,
    majorVersion: payload.majorVersion ?? 0,
    entitlements: payload.entitlements ?? [],
    expiresAt: typeof payload.exp === 'number' ? payload.exp * 1000 : undefined,
  };
}
