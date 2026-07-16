import { describe, expect, it } from 'vitest';
import { WorldData } from '../world/WorldData';
import { createWorldConfig } from '../world/WorldConfig';
import { CommandBus } from './CommandBus';
import { History } from './History';
import { AddPOICommand, AddRegionCommand } from './vectorCommands';

const makeWorld = () =>
  new WorldData(
    createWorldConfig({
      projectName: 'Teste',
      extent: { width_m: 1024, height_m: 1024 },
      terrainResolution_m: 4,
      heightRange: { min_m: -200, max_m: 1800 },
    }),
  );

describe('camadas vetoriais simples (README §4.6)', () => {
  it('mundo nasce com estradas, regiões e POIs na pilha de camadas', () => {
    const world = makeWorld();
    expect(world.layers.getByType('road').length).toBe(1);
    expect(world.layers.getByType('region').length).toBe(1);
    expect(world.layers.getByType('poi').length).toBe(1);
  });

  it('AddRegionCommand: apply/undo/redo', () => {
    const world = makeWorld();
    const bus = new CommandBus(world, new History());
    bus.execute(
      new AddRegionCommand({
        id: 'r1',
        name: 'Reino do Norte',
        description: '',
        polygon: [
          [0, 0],
          [200, 0],
          [200, 200],
          [0, 200],
        ],
        color: '#8844aa',
        properties: {},
      }),
    );
    expect(world.regions.regions.length).toBe(1);
    bus.undo();
    expect(world.regions.regions.length).toBe(0);
    bus.redo();
    expect(world.regions.regions[0].name).toBe('Reino do Norte');
  });

  it('AddPOICommand: apply/undo', () => {
    const world = makeWorld();
    const bus = new CommandBus(world, new History());
    bus.execute(
      new AddPOICommand({
        id: 'p1',
        name: 'Capital',
        icon: '★',
        pos: { x: 512, y: 512 },
        properties: {},
      }),
    );
    expect(world.pois.pois.length).toBe(1);
    bus.undo();
    expect(world.pois.pois.length).toBe(0);
  });
});
