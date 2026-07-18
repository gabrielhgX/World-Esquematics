import { describe, expect, it } from 'vitest';
import {
  FORMAT_VERSION,
  MEMORY_BUDGET_BYTES,
  createWorldConfig,
  deriveGrid,
  estimateTerrainBytes,
  validateWorldConfig,
} from './WorldConfig';

// Configuração recomendada do README §1: 16×16 km @ 4 m/célula
const base = {
  projectName: 'Teste',
  extent: { width_m: 16000, height_m: 16000 },
  terrainResolution_m: 4,
  heightRange: { min_m: -200, max_m: 1800 },
};

describe('WorldConfig (README §1)', () => {
  it('createWorldConfig preenche formatVersion, origin e createdAt', () => {
    const config = createWorldConfig(base);
    expect(config.formatVersion).toBe(FORMAT_VERSION);
    expect(config.origin).toEqual({ lat: null, lon: null });
    expect(Number.isNaN(Date.parse(config.createdAt))).toBe(false);
  });

  it('grid derivado: 16000 m / 4 m = 4000 × 4000 células', () => {
    expect(deriveGrid(base)).toEqual({ widthCells: 4000, heightCells: 4000 });
  });

  it('custo de memória da tabela §1.1: 4000² × 2 bytes = 32 MB', () => {
    expect(estimateTerrainBytes(base)).toBe(32_000_000);
  });

  it('configuração recomendada passa no orçamento web', () => {
    expect(validateWorldConfig(base, MEMORY_BUDGET_BYTES.web)).toEqual([]);
  });

  it('16 km @ 1 m (512 MB) é bloqueado no orçamento web (tabela §1.1)', () => {
    const config = { ...base, terrainResolution_m: 1 };
    const errors = validateWorldConfig(config, MEMORY_BUDGET_BYTES.web).filter(
      (i) => i.severity === 'error',
    );
    expect(errors.length).toBe(1);
    expect(estimateTerrainBytes(config)).toBe(512_000_000);
  });

  it('16 km @ 1 m cabe no orçamento desktop (2 GB)', () => {
    const config = { ...base, terrainResolution_m: 1 };
    expect(validateWorldConfig(config, MEMORY_BUDGET_BYTES.desktop)).toEqual([]);
  });

  it('rejeita extensão/resolução não positivas e range invertido', () => {
    const bad = validateWorldConfig(
      {
        projectName: 'x',
        extent: { width_m: 0, height_m: -5 },
        terrainResolution_m: 0,
        heightRange: { min_m: 100, max_m: 100 },
      },
      MEMORY_BUDGET_BYTES.web,
    );
    expect(bad.filter((i) => i.severity === 'error').length).toBe(3);
  });

  it('rejeita valores NaN (entrada de formulário vazia)', () => {
    const bad = validateWorldConfig(
      { ...base, terrainResolution_m: Number.NaN },
      MEMORY_BUDGET_BYTES.web,
    );
    expect(bad.some((i) => i.severity === 'error')).toBe(true);
  });

  it('avisa quando a extensão não é múltipla da resolução', () => {
    const config = { ...base, extent: { width_m: 16001, height_m: 16000 } };
    const issues = validateWorldConfig(config, MEMORY_BUDGET_BYTES.web);
    expect(issues.some((i) => i.severity === 'warning')).toBe(true);
    expect(deriveGrid(config).widthCells).toBe(4001); // ceil cobre a extensão
  });

  it('bloqueia grid acima do limite de textura da GPU (P1-3)', () => {
    // GPU integrada típica: MAX_TEXTURE_SIZE = 4096; o grid 4000² passa,
    // mas 16 km @ 2 m (8000²) não abriria nessa máquina.
    const ok = validateWorldConfig(base, MEMORY_BUDGET_BYTES.web, 4096);
    expect(ok.some((i) => i.severity === 'error')).toBe(false);

    const fine = { ...base, terrainResolution_m: 2 }; // grid 8000²
    const blocked = validateWorldConfig(fine, MEMORY_BUDGET_BYTES.web, 4096);
    const err = blocked.find((i) => i.severity === 'error');
    expect(err?.message).toMatch(/limite de textura/);
    expect(err?.message).toMatch(/4096/);
  });

  it('sem maxTextureSize a checagem de GPU não roda (Node/testes)', () => {
    const fine = { ...base, terrainResolution_m: 2 };
    const issues = validateWorldConfig(fine, MEMORY_BUDGET_BYTES.web);
    expect(issues.some((i) => i.message.includes('textura'))).toBe(false);
  });
});
