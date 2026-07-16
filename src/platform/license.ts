/**
 * Licenciamento (README §10.2) — schema decidido ANTES dos providers:
 *
 *   { plan, majorVersion, entitlements[] }
 *
 * expressivo o bastante para qualquer modelo futuro, mas o v1 APLICA SÓ o
 * majorVersion:
 *   - Steam:  vitalício DENTRO da major comprada (v1.x; v2 = compra nova,
 *     modelo JetBrains/Sublime) — major mais nova cobre as antigas;
 *   - Web:    assinatura, sempre a última versão — vale enquanto não expira.
 *
 * entitlements[] começa vazio e NÃO é checado em lugar nenhum no v1. Quando
 * nuvem/sync e biblioteca de assets entrarem, viram entitlements — sem
 * migração de schema.
 */

/** major do app em execução — na Steam, o build trava nesta major */
export const APP_MAJOR_VERSION = 1;

export type LicensePlan = 'web-subscription' | 'steam-lifetime';

export interface License {
  plan: LicensePlan;
  /** major coberta pela compra (Steam); informativo na web */
  majorVersion: number;
  /** capacidades futuras (nuvem, assets…) — vazio e ignorado no v1 */
  entitlements: string[];
  /** fim do período pago em epoch ms — obrigatório em web-subscription */
  expiresAt?: number;
}

export type LicenseStatus =
  { ok: true; license: License; offline?: boolean } | { ok: false; reason: string };

export interface LicenseProvider {
  /** JWT do servidor (web) | Steamworks (desktop). Cabe ao App revalidar. */
  getLicense(): Promise<LicenseStatus>;
}

/** A regra de negócio do v1, num lugar só — providers apenas OBTÊM a licença. */
export function checkLicense(
  license: License,
  appMajorVersion: number = APP_MAJOR_VERSION,
  now: number = Date.now(),
): LicenseStatus {
  if (license.plan === 'steam-lifetime') {
    if (appMajorVersion > license.majorVersion) {
      return {
        ok: false,
        reason:
          `Sua licença Steam cobre a v${license.majorVersion}.x — esta é a ` +
          `v${appMajorVersion}. A v${appMajorVersion} é uma compra nova (a ` +
          `v${license.majorVersion}.x continua sua para sempre).`,
      };
    }
    return { ok: true, license };
  }

  // web-subscription: vale enquanto não expira; major é sempre a última
  if (typeof license.expiresAt !== 'number') {
    return { ok: false, reason: 'Licença de assinatura sem validade — refaça o login.' };
  }
  if (now >= license.expiresAt) {
    return { ok: false, reason: 'Assinatura expirada — renove para continuar editando.' };
  }
  return { ok: true, license };
}
