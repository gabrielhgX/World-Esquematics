import { describe, expect, it } from 'vitest';
import { WorldData } from '../world/WorldData';
import { createWorldConfig } from '../world/WorldConfig';
import { CommandBus } from './CommandBus';
import { History } from './History';
import { AddBiomePolygonCommand, AddObjectCommand } from './biomeCommands';
import { createBiomePolygon } from '../layers/BiomeLayer';
import { newId } from '../utils/id';

const makeWorld = () =>
  new WorldData(
    createWorldConfig({
      projectName: 'Teste',
      extent: { width_m: 1024, height_m: 1024 },
      terrainResolution_m: 4,
      heightRange: { min_m: -200, max_m: 1800 },
    }),
  );

describe('comandos de biomas e objetos (README §4.4/§4.6)', () => {
  it('mundo nasce com as 7 camadas na ordem de desenho do §6', () => {
    const world = makeWorld();
    expect(world.layers.inOrder().map((l) => l.type)).toEqual([
      'terrain',
      'biome',
      'water',
      'road',
      'region',
      'poi',
      'object',
    ]);
    expect(world.biomes.palette.length).toBeGreaterThanOrEqual(4);
    expect(world.biomes.palette.every((b) => b.id > 0)).toBe(true); // 0 = sem bioma
  });

  it('AddBiomePolygonCommand: apply/undo/redo', () => {
    const world = makeWorld();
    const bus = new CommandBus(world, new History());
    bus.execute(
      new AddBiomePolygonCommand(
        createBiomePolygon(2, [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
        ]),
      ),
    );
    expect(world.biomes.polygons.length).toBe(1);
    bus.undo();
    expect(world.biomes.polygons.length).toBe(0);
    bus.redo();
    expect(world.biomes.polygons[0].biomeId).toBe(2);
  });

  it('AddObjectCommand: struct sem Z absoluto (Z é derivado — §4.6)', () => {
    const world = makeWorld();
    const bus = new CommandBus(world, new History());
    bus.execute(
      new AddObjectCommand({
        id: newId(),
        type: 'house_medieval_02',
        pos: { x: 500, y: 500 },
        z_offset_m: 0,
        rotation_deg: 45,
        scale: { x: 1, y: 1, z: 1 },
        alignToSlope: false,
        tags: ['vila'],
      }),
    );
    expect(world.objects.objects.length).toBe(1);
    const object = world.objects.objects[0];
    expect('z' in object).toBe(false); // nunca armazenar Z absoluto
    expect(object.pos).toEqual({ x: 500, y: 500 });
    bus.undo();
    expect(world.objects.objects.length).toBe(0);
  });
});
