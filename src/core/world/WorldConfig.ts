/**
 * WorldConfig — Estrutura do Mundo (README §1).
 *
 * D2: extensão e resolução são DESACOPLADAS — o usuário escolhe as duas na
 * criação do projeto e a UI mostra o custo em MB em tempo real, bloqueando
 * combinações acima do orçamento da plataforma (README §1.1).
 */

export interface WorldExtent {
  /** extensão real em metros */
  width_m: number;
  height_m: number;
}

/** D3: relevo em uint16; o range mapeia 0..65535 para min_m..max_m. */
export interface HeightRange {
  /** mapeia para uint16 = 0 */
  min_m: number;
  /** mapeia para uint16 = 65535 */
  max_m: number;
}

export interface WorldOrigin {
  /** opcional, se georreferenciado */
  lat: number | null;
  lon: number | null;
}

export interface WorldConfig {
  projectName: string;
  extent: WorldExtent;
  /** metros por célula do heightmap */
  terrainResolution_m: number;
  heightRange: HeightRange;
  origin: WorldOrigin;
  createdAt: string;
  formatVersion: typeof FORMAT_VERSION;
}

export const FORMAT_VERSION = 1;

/**
 * Orçamentos de memória por plataforma (README §1.1), em bytes decimais:
 * web 256 MB, desktop 2 GB.
 */
export const MEMORY_BUDGET_BYTES = {
  web: 256_000_000,
  desktop: 2_000_000_000,
} as const;

export interface GridSize {
  widthCells: number;
  heightCells: number;
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  message: string;
}

/** Cria um WorldConfig preenchendo os campos gerados (createdAt, formatVersion). */
export function createWorldConfig(init: {
  projectName: string;
  extent: WorldExtent;
  terrainResolution_m: number;
  heightRange: HeightRange;
  origin?: WorldOrigin;
}): WorldConfig {
  return {
    projectName: init.projectName,
    extent: { ...init.extent },
    terrainResolution_m: init.terrainResolution_m,
    heightRange: { ...init.heightRange },
    origin: init.origin ? { ...init.origin } : { lat: null, lon: null },
    createdAt: new Date().toISOString(),
    formatVersion: FORMAT_VERSION,
  };
}

/**
 * Grid derivado da extensão + resolução (README §1: 16000 m / 4 m = 4000).
 * `ceil` garante que toda a extensão fica coberta quando a divisão não é exata
 * (nesse caso `validateWorldConfig` emite um aviso).
 */
export function deriveGrid(config: Pick<WorldConfig, 'extent' | 'terrainResolution_m'>): GridSize {
  return {
    widthCells: Math.ceil(config.extent.width_m / config.terrainResolution_m),
    heightCells: Math.ceil(config.extent.height_m / config.terrainResolution_m),
  };
}

/** Custo do heightmap uint16 denso, em bytes (tabela do README §1.1). */
export function estimateTerrainBytes(
  config: Pick<WorldConfig, 'extent' | 'terrainResolution_m'>,
): number {
  const grid = deriveGrid(config);
  return grid.widthCells * grid.heightCells * Uint16Array.BYTES_PER_ELEMENT;
}

/**
 * Valida a configuração contra o orçamento de memória da plataforma.
 * Erros bloqueiam a criação do projeto; avisos apenas informam.
 * As comparações usam a forma `!(x > 0)` para que NaN também reprove.
 */
export function validateWorldConfig(
  config: Pick<WorldConfig, 'projectName' | 'extent' | 'terrainResolution_m' | 'heightRange'>,
  budgetBytes: number,
  /** limite de textura da GPU (P1-3): um grid maior que isto não renderiza */
  maxTextureSize?: number,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (config.projectName.trim().length === 0) {
    issues.push({ severity: 'warning', message: 'O projeto está sem nome.' });
  }
  if (!(config.extent.width_m > 0) || !(config.extent.height_m > 0)) {
    issues.push({ severity: 'error', message: 'A extensão do mundo deve ser positiva.' });
  }
  if (!(config.terrainResolution_m > 0)) {
    issues.push({ severity: 'error', message: 'A resolução do terreno deve ser positiva.' });
  }
  if (!(config.heightRange.max_m > config.heightRange.min_m)) {
    issues.push({
      severity: 'error',
      message: 'A altura máxima deve ser maior que a mínima.',
    });
  }
  if (issues.some((i) => i.severity === 'error')) {
    return issues; // sem grid válido não há o que medir
  }

  const remainderX = config.extent.width_m % config.terrainResolution_m;
  const remainderY = config.extent.height_m % config.terrainResolution_m;
  if (remainderX !== 0 || remainderY !== 0) {
    issues.push({
      severity: 'warning',
      message: 'A extensão não é múltipla da resolução; o grid será arredondado para cima.',
    });
  }

  const bytes = estimateTerrainBytes(config);
  if (bytes > budgetBytes) {
    issues.push({
      severity: 'error',
      message:
        `Heightmap de ${formatMB(bytes)} MB excede o orçamento da plataforma ` +
        `(${formatMB(budgetBytes)} MB). Reduza a extensão ou aumente os metros por célula.`,
    });
  }

  // P1-3: um grid maior que o limite de textura da GPU não renderiza — e um
  // projeto criado numa máquina boa não abriria numa fraca. Bloqueia cedo,
  // com o número real e a saída (reduzir extensão ou aumentar m/célula).
  if (maxTextureSize !== undefined) {
    const grid = deriveGrid(config);
    if (grid.widthCells > maxTextureSize || grid.heightCells > maxTextureSize) {
      const maxExtent = maxTextureSize * config.terrainResolution_m;
      issues.push({
        severity: 'error',
        message:
          `Grid ${grid.widthCells}×${grid.heightCells} excede o limite de textura ` +
          `desta GPU (${maxTextureSize}). Reduza a extensão (≤ ${(maxExtent / 1000).toFixed(1)} km ` +
          `nesta resolução) ou aumente os metros por célula.`,
      });
    }
  }
  return issues;
}

function formatMB(bytes: number): string {
  return (bytes / 1_000_000).toFixed(0);
}
