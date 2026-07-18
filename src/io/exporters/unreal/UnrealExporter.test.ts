import { describe, expect, it } from 'vitest';
import { WorldData, createWorldConfig, heightToU16 } from '../../../core';
import { UnrealExporter } from './UnrealExporter';
import { nearestLandscapeSize } from './landscapeSizes';

const exporter = new UnrealExporter();

// extent 2020 @ 4 m ⇒ grid 505² = tamanho EXATO de Landscape: sem
// reamostragem, asserções de pixel diretas.
const makeWorld = (extent_m = 2020, resolution_m = 4) =>
  new WorldData(
    createWorldConfig({
      projectName: 'Teste',
      extent: { width_m: extent_m, height_m: extent_m },
      terrainResolution_m: resolution_m,
      heightRange: { min_m: -200, max_m: 1800 },
    }),
  );

/** Lê o pixel (col, row) do heightmap.r16 exportado (uint16 LE). */
function readPixel(r16: Uint8Array, width: number, col: number, row: number): number {
  return new DataView(r16.buffer, r16.byteOffset).getUint16((row * width + col) * 2, true);
}

describe('nearestLandscapeSize (README §9.1, gotcha #1)', () => {
  it("padrão 'up': o MENOR tamanho ≥ pedido (nunca reduz em silêncio — P1-6)", () => {
    expect(nearestLandscapeSize(505)).toBe(505); // exato
    expect(nearestLandscapeSize(512)).toBe(1009); // 505 reduziria: sobe
    expect(nearestLandscapeSize(4000)).toBe(4033); // 2017 perderia 33%: sobe
    expect(nearestLandscapeSize(200)).toBe(253);
    expect(nearestLandscapeSize(1)).toBe(127);
    expect(nearestLandscapeSize(20000)).toBe(8129); // teto: reduz (não há maior)
  });

  it("'nearest' é a redução EXPLÍCITA (mais próximo, empate → maior)", () => {
    expect(nearestLandscapeSize(512, 'nearest')).toBe(505);
    expect(nearestLandscapeSize(3000, 'nearest')).toBe(2017);
    expect(nearestLandscapeSize(4000, 'nearest')).toBe(4033);
  });
});

describe('UnrealExporter — heightmap mínimo (README §9.1)', () => {
  it('validate avisa sobre a reamostragem quando o grid não bate com a tabela', () => {
    const world = makeWorld(2400); // grid 600² → sobe para 1009²
    const issues = exporter.validate(world);
    expect(issues.some((i) => i.severity === 'warning' && i.message.includes('1009'))).toBe(true);
    expect(issues.every((i) => i.severity !== 'error')).toBe(true);
  });

  it('grid já válido (505²): exporta sem reamostrar, quads redondos', async () => {
    const world = makeWorld();
    const bundle = await exporter.export(world);

    const r16 = bundle.files.find((f) => f.path === 'heightmap.r16')!;
    expect(r16.data.length).toBe(505 * 505 * 2);

    const manifest = JSON.parse(
      new TextDecoder().decode(bundle.files.find((f) => f.path === 'unreal_import.json')!.data),
    );
    expect(manifest.landscape.resolutionX).toBe(505);
    expect(bundle.notes.some((n) => n.includes('reamostrado'))).toBe(false);
    // P1-5: span amostrado = 504 quads × 4 m ⇒ escala redonda de 4 m/quad
    expect(manifest.landscape.scale.x).toBeCloseTo(400, 9);
  });

  it('gotcha #2: ZScale e LocationZ corretos para o heightRange', async () => {
    const world = makeWorld(); // range -200..1800 → span 2000 m
    const bundle = await exporter.export(world);
    const manifest = JSON.parse(
      new TextDecoder().decode(bundle.files.find((f) => f.path === 'unreal_import.json')!.data),
    );
    // ZScale = 2000/512×100 = 390.625 (independe do grid)
    expect(manifest.landscape.scale.z).toBeCloseTo(390.625, 6);
    // LocationZ = -200 + 256×3.90625 = 800 m → 80000 UE units (cm)
    expect(manifest.landscape.location.z).toBeCloseTo(80000, 3);
  });

  it('range de exatamente 512 m dá o ZScale padrão (100)', async () => {
    const world = new WorldData(
      createWorldConfig({
        projectName: 'Teste',
        extent: { width_m: 2020, height_m: 2020 },
        terrainResolution_m: 4,
        heightRange: { min_m: -256, max_m: 256 },
      }),
    );
    const manifest = JSON.parse(
      new TextDecoder().decode(
        (await exporter.export(world)).files.find((f) => f.path === 'unreal_import.json')!.data,
      ),
    );
    expect(manifest.landscape.scale.z).toBeCloseTo(100, 9);
    expect(manifest.landscape.location.z).toBeCloseTo(0, 6);
  });

  it('gotcha #3: mapa "L" assimétrico sai sem espelhamento (README §9.1/§11)', async () => {
    // L no espaço canônico (X=Leste, Y=Norte): barra vertical no OESTE
    // (norte↔sul inteira) + barra horizontal no SUL. Canto do L = sudoeste.
    const world = makeWorld(); // grid 505², exporta 505² (sem resample)
    const raster = world.terrain.raster;
    const high = heightToU16(500, world.config.heightRange);
    for (let y = 0; y < 505; y++) {
      for (let x = 0; x < 50; x++) raster.set(x, y, high); // barra oeste
    }
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 256; x++) raster.set(x, y, high); // barra sul
    }

    const bundle = await exporter.export(world);
    const r16 = bundle.files.find((f) => f.path === 'heightmap.r16')!.data;
    const W = 505;
    const base = world.terrain.baseHeight_u16;
    const isHigh = (v: number) => Math.abs(v - high) < 1500;
    const isBase = (v: number) => Math.abs(v - base) < 1500;

    // linha 0 da imagem = NORTE. Barra oeste aparece na coluna esquerda em
    // TODAS as linhas; barra sul aparece só nas ÚLTIMAS linhas.
    expect(isHigh(readPixel(r16, W, 20, 10))).toBe(true); // noroeste: barra oeste
    expect(isHigh(readPixel(r16, W, 20, W - 10))).toBe(true); // sudoeste: canto do L
    expect(isHigh(readPixel(r16, W, 150, W - 10))).toBe(true); // sul-centro: barra sul
    expect(isBase(readPixel(r16, W, 150, 10))).toBe(true); // norte-centro: vazio
    expect(isBase(readPixel(r16, W, 400, Math.floor(W / 2)))).toBe(true); // leste: vazio

    // Se o flip vertical fosse esquecido (mapa espelhado), a barra sul
    // apareceria no topo da imagem — este é o teste que pega o sinal trocado.
    expect(isBase(readPixel(r16, W, 150, 10))).toBe(true);
  });
});
