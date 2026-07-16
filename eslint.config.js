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
    // O app roda no NAVEGADOR: módulos do Node só em testes (que rodam em
    // Node) — em código de produto seriam um crash de runtime no browser.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}', 'src/**/*TestUtils.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*'],
              message: 'Módulos do Node não existem no navegador — só em *.test.ts.',
            },
          ],
        },
      ],
    },
  },
  {
    // Exceção: platform/electron roda no processo MAIN do Electron (Node de
    // verdade) — nunca pode ser importado pelo código do navegador.
    files: ['src/platform/electron/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // E o código do navegador nunca importa platform/electron.
    files: ['src/{ui,render,tools}/**/*.{ts,tsx}', 'src/platform/web/**/*.ts'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', '**/platform/electron/**'],
              message: 'Código do navegador: sem módulos do Node nem platform/electron.',
            },
          ],
        },
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
            {
              // este bloco SUBSTITUI o de cima para src/core — repete o node:*
              group: ['node:*'],
              message: 'Módulos do Node não existem no navegador — só em *.test.ts.',
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
