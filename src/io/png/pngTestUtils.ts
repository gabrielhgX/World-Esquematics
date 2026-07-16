/**
 * Decoder PNG grayscale-8 SÓ PARA TESTES (round-trip do encoder e dos
 * weightmaps). O produto nunca lê PNG — não usar fora de *.test.ts.
 */
export async function decodeGrayPng8(
  png: Uint8Array,
): Promise<{ width: number; height: number; pixels: Uint8Array }> {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((byte, i) => png[i] === byte)) {
    throw new Error('Assinatura PNG inválida.');
  }
  const view = new DataView(png.buffer, png.byteOffset);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idatParts: Uint8Array[] = [];
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8));
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      const ihdr = new DataView(png.buffer, png.byteOffset + offset + 8);
      width = ihdr.getUint32(0);
      height = ihdr.getUint32(4);
      if (data[8] !== 8 || data[9] !== 0) {
        throw new Error(`Só grayscale-8: bit depth ${data[8]}, color type ${data[9]}.`);
      }
    }
    if (type === 'IDAT') idatParts.push(data);
    offset += 12 + length;
  }
  const zlib = new Blob(idatParts as BlobPart[])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'));
  const raw = new Uint8Array(await new Response(zlib).arrayBuffer());
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    if (raw[y * (width + 1)] !== 0)
      throw new Error(`Filtro ${raw[y * (width + 1)]} não suportado.`);
    pixels.set(raw.subarray(y * (width + 1) + 1, (y + 1) * (width + 1)), y * width);
  }
  return { width, height, pixels };
}
