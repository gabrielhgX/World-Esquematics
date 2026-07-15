/**
 * Emissor de eventos tipado e mínimo, sem dependências (o core não pode
 * depender de DOM/EventTarget — README §2).
 */

type Listener<T> = (payload: T) => void;

export class EventEmitter<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  /** Registra o ouvinte e devolve a função de desinscrição. */
  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => this.off(event, listener);
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.listeners.get(event)?.delete(listener as Listener<never>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.listeners.get(event)?.forEach((listener) => {
      (listener as Listener<Events[K]>)(payload);
    });
  }
}
