// Fronteiras da arquitetura feature-first (ver AGENTS.md):
// - módulo nunca importa outro módulo (nem do mesmo app, nem de outro app)
// - módulo pode usar shared/ do próprio app e @whaviso/shared
// - shared/ de app pode usar @whaviso/shared, nunca módulos
import tseslint from 'typescript-eslint'
import boundaries from 'eslint-plugin-boundaries'

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', 'supabase/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['apps/*/src/**/*.ts', 'packages/*/src/**/*.ts'],
    // Testes podem fazer bootstrap do app (cruzar fronteiras): a regra vale para código de produção.
    ignores: ['**/*.test.ts', '**/tests/**'],
    plugins: { boundaries },
    settings: {
      'import/resolver': {
        typescript: {
          project: ['apps/*/tsconfig.json', 'packages/*/tsconfig.json'],
        },
      },
      'boundaries/include': ['apps/*/src/**/*', 'packages/*/src/**/*'],
      'boundaries/elements': [
        {
          type: 'module',
          pattern: 'apps/*/src/modules/*',
          capture: ['app', 'module'],
        },
        {
          type: 'app-shared',
          pattern: 'apps/*/src/shared/*',
          capture: ['app', 'specialist'],
        },
        {
          type: 'app-root',
          pattern: 'apps/*/src/*',
          mode: 'full',
          capture: ['app'],
        },
        {
          type: 'pkg-shared',
          pattern: 'packages/shared/src/*',
          capture: ['specialist'],
        },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          message:
            'Import proibido pela arquitetura (${file.type} -> ${dependency.type}). Módulo nunca importa módulo; use shared/ ou um contrato.',
          rules: [
            {
              from: ['module'],
              allow: [['app-shared', { app: '${from.app}' }], 'pkg-shared'],
            },
            {
              from: ['app-shared'],
              allow: [['app-shared', { app: '${from.app}' }], 'pkg-shared'],
            },
            {
              from: ['app-root'],
              allow: [
                ['module', { app: '${from.app}' }],
                ['app-shared', { app: '${from.app}' }],
                ['app-root', { app: '${from.app}' }],
                'pkg-shared',
              ],
            },
            {
              from: ['pkg-shared'],
              allow: ['pkg-shared'],
            },
          ],
        },
      ],
    },
  },
)
