# Steam: shell Electron e pipeline de build (README §10.1/§10.2, item 32)

O código desta base já está pronto para o build da Steam — o que falta é o
empacotamento, que exige o Steamworks SDK e um appid reais (não disponíveis
neste repositório). Este documento fixa as decisões para quando isso chegar.

## O que já existe no código

| Peça               | Onde                                                   | Estado                                          |
| ------------------ | ------------------------------------------------------ | ----------------------------------------------- |
| `Platform` adapter | `src/platform/Platform.ts`                             | a UI só conhece a interface                     |
| Storage filesystem | `src/platform/electron/FilesystemProjectRepository.ts` | testado em Node real                            |
| Licença Steamworks | `src/platform/electron/SteamworksLicenseProvider.ts`   | testado contra a interface `SteamworksApi`      |
| Raiz de composição | `src/ui/main.tsx`                                      | troca de plataforma = trocar UMA chamada        |
| Regra de major     | `src/platform/license.ts`                              | v1.x vitalício; v2 = appid novo (decisão §10.2) |

## Shell Electron (por que Electron: §10.1 — Chromium embutido, um WebGL só)

1. `electron/main.ts` (processo main): cria a `BrowserWindow`, instancia
   `FilesystemProjectRepository(app.getPath('userData'))` e o
   `SteamworksLicenseProvider` com o binding real (ex.: `steamworks.js`),
   e expõe ambos por IPC (`contextBridge` no preload).
2. O renderer monta o `Platform` com proxies IPC — o `App` não muda.
3. `steam_appid.txt` com o appid da major (a v2 será um appid NOVO —
   modelo JetBrains/Sublime; a regra já está em `checkLicense`).

## Pipeline

1. `vite build` → `dist/` (o mesmo build da web).
2. `electron-builder` → executáveis win/linux/mac (NSIS/AppImage/dmg).
3. `steamcmd` + `app_build.vdf` → upload do depot para a branch beta.
4. Smoke test na branch beta (licença, save/load em filesystem, export) →
   promover para default.

O `APP_MAJOR_VERSION` (`src/platform/license.ts`) é gravado no build e deve
bater com a major do appid — é ele que o `SteamworksLicenseProvider` usa.

## Diferenciação web × Steam (decisão registrada)

- **Steam**: vitalício dentro da major comprada; filesystem local; projetos
  ilimitados; sem exigir rede (Steamworks valida offline).
- **Web**: assinatura, sempre a última versão; IndexedDB; nuvem/sync e
  biblioteca de assets entram como `entitlements[]` futuros, sem migração
  de schema.
