import { describe, expect, it } from 'vitest';
import { MEMORY_BUDGET_BYTES, traceFlowNetwork, validateWorldConfig } from '../core';
import { EXAMPLE_WORLDS } from './exampleWorlds';

describe('mapas de exemplo (README §11, item 33)', () => {
  for (const example of EXAMPLE_WORLDS) {
    it(`"${example.name}" constrói um mundo válido e vivo`, () => {
      const start = performance.now();
      const world = example.build();
      const elapsed = performance.now() - start;

      // config dentro do orçamento web
      const issues = validateWorldConfig(world.config, MEMORY_BUDGET_BYTES.web);
      expect(issues.filter((i) => i.severity === 'error')).toEqual([]);

      // vivo: relevo esculpido, biomas e ao menos um corpo d'água/POI
      expect(world.terrain.raster.allocatedTileCount).toBeGreaterThan(0);
      expect(world.biomes.polygons.length).toBeGreaterThan(0);
      expect(world.pois.pois.length).toBeGreaterThan(0);
      expect(world.water.lakes.length + world.water.rivers.length).toBeGreaterThan(0);

      // rios respeitam a cota decrescente (§4.3)
      for (const river of world.water.rivers) {
        for (let i = 1; i < river.nodes.length; i++) {
          expect(river.nodes[i].surface_m).toBeLessThanOrEqual(river.nodes[i - 1].surface_m);
        }
      }

      // onboarding não pode travar a máquina do usuário. Orçamento folgado:
      // é um teto anti-patologia (build de segundos), não um benchmark — em
      // CI/máquina remota lenta um mundo esculpido leva alguns segundos.
      expect(elapsed).toBeLessThan(8000);
    });
  }

  it('"Serras Erodidas" tem rede de drenagem real (mostra a lente Hidrografia)', () => {
    const world = EXAMPLE_WORLDS.find((e) => e.id === 'serras-erodidas')!.build();
    // o exemplo existe para a lente de Hidrografia aparecer já de cara: o
    // relevo rugoso PRECISA concentrar fluxo em talvegues de verdade
    const { channels, maxAccumulation } = traceFlowNetwork(world.terrain, 4);
    expect(channels.length).toBeGreaterThan(10);
    expect(maxAccumulation).toBeGreaterThan(500);
  });

  it('determinístico: construir duas vezes dá o mesmo relevo', () => {
    const a = EXAMPLE_WORLDS[0].build();
    const b = EXAMPLE_WORLDS[0].build();
    expect(a.terrain.raster.get(1024, 1024)).toBe(b.terrain.raster.get(1024, 1024));
    expect(a.biomes.scatterSeed).toBe(b.biomes.scatterSeed);
  });
});
