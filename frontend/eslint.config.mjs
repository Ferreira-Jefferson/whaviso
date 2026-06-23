// Fronteiras da arquitetura feature-first do FRONTEND (ver AGENTS.md):
// - módulo NUNCA importa outro módulo (lint barra)
// - módulo pode usar shared/* do app
// - shared/* não importa módulo (nem app)
// - app/* pode importar módulos, shared e app
// Adaptado de backend/eslint.config.mjs; cobre .ts E .tsx; inclui react-hooks
// e react-refresh.
import tseslint from 'typescript-eslint'
import boundaries from 'eslint-plugin-boundaries'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', 'vite.config.ts'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    // Testes podem cruzar fronteiras para bootstrap: a regra vale p/ produção.
    ignores: ['**/*.test.{ts,tsx}', '**/tests/**'],
    plugins: { boundaries },
    settings: {
      'import/resolver': {
        typescript: { project: ['tsconfig.json'] },
      },
      'boundaries/include': ['src/**/*'],
      'boundaries/elements': [
        {
          type: 'module',
          pattern: 'src/modules/*',
          capture: ['module'],
        },
        {
          type: 'app-shared',
          pattern: 'src/shared/*',
          capture: ['specialist'],
        },
        {
          type: 'app-root',
          pattern: 'src/app/**/*',
          mode: 'full',
        },
        {
          type: 'entry',
          pattern: 'src/main.tsx',
          mode: 'full',
        },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          message:
            'Import proibido pela arquitetura (${file.type} -> ${dependency.type}). Módulo nunca importa módulo; use shared/* ou um contrato.',
          rules: [
            {
              from: ['module'],
              allow: ['app-shared'],
            },
            {
              from: ['app-shared'],
              allow: ['app-shared'],
            },
            {
              from: ['app-root', 'entry'],
              allow: ['module', 'app-shared', 'app-root', 'entry'],
            },
          ],
        },
      ],
    },
  },
)
