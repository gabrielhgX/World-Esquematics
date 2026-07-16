/** Gera um id único (uuid quando WebCrypto está disponível — browser e Node ≥ 19). */
export function newId(): string {
  const crypto = globalThis.crypto;
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
