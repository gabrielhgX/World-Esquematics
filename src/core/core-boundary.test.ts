import { describe, expect, it } from 'vitest';

/**
 * Teste de sanidade da arquitetura (README §2 e §13):
 * "o core deve rodar em Node.js, sem DOM, num teste unitário.
 *  Se import de qualquer coisa em core/ falhar sem DOM, a fronteira foi violada."
 *
 * Este arquivo roda no ambiente `node` do Vitest — sem window, sem document.
 */
describe('fronteira da arquitetura (README §2)', () => {
  it('o ambiente de teste não tem DOM', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it('a API pública do core importa e instancia em Node puro', async () => {
    const core = await import('./index');

    expect(core.WorldData).toBeTypeOf('function');
    expect(core.TiledRaster).toBeTypeOf('function');
    expect(core.CommandBus).toBeTypeOf('function');
    expect(core.History).toBeTypeOf('function');
    expect(core.LayerStack).toBeTypeOf('function');

    const config = core.createWorldConfig({
      projectName: 'Fronteira',
      extent: { width_m: 16000, height_m: 16000 },
      terrainResolution_m: 4,
      heightRange: { min_m: -200, max_m: 1800 },
    });
    const world = new core.WorldData(config);
    const bus = new core.CommandBus(world);
    expect(bus.history.canUndo).toBe(false);
  });
});
