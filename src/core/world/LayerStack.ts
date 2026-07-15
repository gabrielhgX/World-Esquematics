import type { Layer, LayerType } from './Layer';

/**
 * Pilha de camadas (README §4.1).
 *
 * `terrain` é SINGLETON — existe exatamente um relevo. As demais podem ter
 * múltiplas instâncias (ex.: "Objetos — Vegetação", "Objetos — Construções").
 */
export class LayerStack {
  private readonly layers: Layer[] = [];

  add(layer: Layer): void {
    if (layer.type === 'terrain' && this.layers.some((l) => l.type === 'terrain')) {
      throw new Error('TerrainLayer é singleton: já existe um relevo (README §4.1).');
    }
    if (this.layers.some((l) => l.id === layer.id)) {
      throw new Error(`Camada com id duplicado: ${layer.id}`);
    }
    this.layers.push(layer);
  }

  remove(id: string): boolean {
    const index = this.layers.findIndex((l) => l.id === id);
    if (index === -1) return false;
    this.layers.splice(index, 1);
    return true;
  }

  getById(id: string): Layer | undefined {
    return this.layers.find((l) => l.id === id);
  }

  getByType(type: LayerType): Layer[] {
    return this.layers.filter((l) => l.type === type);
  }

  /** Cópia ordenada por `order` (ordem de desenho, de trás para frente). */
  inOrder(): Layer[] {
    return [...this.layers].sort((a, b) => a.order - b.order);
  }

  get count(): number {
    return this.layers.length;
  }
}
