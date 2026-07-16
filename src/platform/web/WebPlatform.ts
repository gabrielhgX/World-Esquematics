import { ConsoleTelemetry, StaticAssetSource, type AssetInfo, type Platform } from '../Platform';
import { IndexedDbProjectRepository } from './IndexedDbProjectRepository';
import { WebLicenseProvider } from './WebLicenseProvider';

/**
 * Composição do Platform da WEB (README §10.2): IndexedDB + JWT. A raiz de
 * composição é o main.tsx — a UI recebe o Platform pronto e não sabe qual é.
 *
 * O endpoint de licença vem de VITE_LICENSE_ENDPOINT; ausente (dev/local), o
 * WebLicenseProvider emite a licença de desenvolvimento.
 */
export function createWebPlatform(options: { assets: AssetInfo[] }): Platform {
  return {
    storage: new IndexedDbProjectRepository(),
    licensing: new WebLicenseProvider({
      endpoint: import.meta.env.VITE_LICENSE_ENDPOINT as string | undefined,
    }),
    telemetry: new ConsoleTelemetry(),
    assetLibrary: new StaticAssetSource(options.assets),
  };
}
