import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Ambiente Node puro: valida na prática a regra de ouro do README §2
    // (o core deve rodar sem DOM).
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
