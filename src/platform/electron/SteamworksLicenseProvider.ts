import { checkLicense, type LicenseProvider, type LicenseStatus } from '../license';

/**
 * Licença da Steam (README §10.2): Steamworks, offline OK — a posse do app
 * é local, sem servidor nosso. O v1 aplica só a major (decisão §10.2):
 * comprou a v1 na Steam, a v1.x é sua para sempre; a v2 é um APP NOVO
 * (appid próprio, modelo JetBrains/Sublime) — por isso a major da licença
 * vem do BUILD, não de uma consulta.
 *
 * O binding real (ex.: steamworks.js no processo main do Electron) entra
 * quando o shell Electron for empacotado; este provider depende só da
 * interface abaixo e está testado contra ela.
 */

export interface SteamworksApi {
  /** ISteamApps::BIsSubscribed — o usuário é dono deste appid? */
  isOwned(): boolean;
}

export class SteamworksLicenseProvider implements LicenseProvider {
  constructor(
    private readonly steam: SteamworksApi,
    /** major coberta por ESTE build/appid (constante de build) */
    private readonly buildMajorVersion: number,
  ) {}

  getLicense(): Promise<LicenseStatus> {
    let owned: boolean;
    try {
      owned = this.steam.isOwned();
    } catch {
      return Promise.resolve({
        ok: false,
        reason: 'Steam indisponível — abra o app pela Steam.',
      });
    }
    if (!owned) {
      return Promise.resolve({
        ok: false,
        reason: 'Esta conta Steam não possui o World-Esquematics.',
      });
    }
    return Promise.resolve(
      checkLicense({
        plan: 'steam-lifetime',
        majorVersion: this.buildMajorVersion,
        entitlements: [],
      }),
    );
  }
}
