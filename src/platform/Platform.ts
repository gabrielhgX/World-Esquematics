import type { LicenseProvider } from './license';
import type { ProjectRepository } from './ProjectRepository';

/**
 * Platform Adapter (README §10.2): o core NÃO PODE SABER se está na web ou
 * na Steam. A UI recebe um Platform pronto na raiz de composição (main.tsx)
 * e nunca toca IndexedDB/filesystem/licença diretamente.
 *
 * | | Web (assinatura) | Steam (vitalício) |
 * | Storage | IndexedDB (+ nuvem futura) | Filesystem local |
 * | Licença | JWT, revalida | Steamworks, offline OK |
 */
export interface Platform {
  storage: ProjectRepository;
  licensing: LicenseProvider;
  telemetry: Telemetry;
  assetLibrary: AssetSource;
}

/** Eventos de produto (criação, save, export). Sem PII — só nomes e números. */
export interface Telemetry {
  event(name: string, data?: Record<string, unknown>): void;
}

export class ConsoleTelemetry implements Telemetry {
  event(name: string, data?: Record<string, unknown>): void {
    console.debug(`[telemetry] ${name}`, data ?? {});
  }
}

export class NoopTelemetry implements Telemetry {
  event(): void {}
}

/**
 * Catálogo de assets (tipos de objeto). No v1 é uma lista estática; quando a
 * biblioteca virar serviço, entra como entitlement da licença (decisão
 * §10.2) — a interface não muda.
 */
export interface AssetInfo {
  type: string;
  label: string;
}

export interface AssetSource {
  listObjectTypes(): Promise<AssetInfo[]>;
}

export class StaticAssetSource implements AssetSource {
  constructor(private readonly assets: AssetInfo[]) {}

  listObjectTypes(): Promise<AssetInfo[]> {
    return Promise.resolve([...this.assets]);
  }
}
