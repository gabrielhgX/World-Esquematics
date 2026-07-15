import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Regra de ouro (README §2): nada abaixo do WorldData importa nada acima.
    // Se o core conhece o React/DOM, a arquitetura já morreu.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/ui/**',
                '**/render/**',
                '**/tools/**',
                '**/io/**',
                '**/platform/**',
                '**/kernels-wasm/**',
                'react',
                'react-dom',
                'react/*',
                'react-dom/*',
              ],
              message: 'core/ deve permanecer puro: sem UI, DOM, render ou plataforma (README §2).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core/ roda em Node puro, sem DOM (README §2).' },
        { name: 'document', message: 'core/ roda em Node puro, sem DOM (README §2).' },
        { name: 'navigator', message: 'core/ roda em Node puro, sem DOM (README §2).' },
      ],
    },
  },
  {
    // Testes podem referenciar window/document para AFIRMAR que não existem.
    files: ['src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-globals': 'off',
    },
  },
);
