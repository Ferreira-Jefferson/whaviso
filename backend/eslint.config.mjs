// Fronteiras da arquitetura feature-first (ver AGENTS.md):
// - módulo nunca importa outro módulo (nem do mesmo app, nem de outro app)
// - módulo pode usar shared/ do próprio app e @whaviso/shared
// - shared/ de app pode usar @whaviso/shared, nunca módulos
import tseslint from 'typescript-eslint'
import boundaries from 'eslint-plugin-boundaries'

// Regra de escrita do repositorio: barra travessao (em/en dash) em codigo e copy.
// O vocabulario proibido da era cobranca (divida/atraso/cobranca/inadimplencia) foi
// REMOVIDO no pivo: "cobranca" agora e termo de dominio legitimo (billing da plataforma,
// modulo plataforma_cobranca). As regras de copy do produto novo (genero neutro, tom ao
// consumidor) virao do modulo de compliance/atendente, nao deste lint.
const TRAVESSAO_PATTERN = '[—–]'
const RE_TRAVESSAO = new RegExp(TRAVESSAO_PATTERN)
const MSG_TRAVESSAO = 'Travessao proibido (em/en dash): use virgula, dois-pontos ou parenteses.'

// Plugin inline: varre o texto de literais, template literals, JSXText e
// comentarios (linha e bloco) procurando travessao e vocabulario proibido.
const linguagem = {
  rules: {
    'no-vocabulario-proibido': {
      meta: { type: 'problem', docs: { description: 'Barra travessao e vocabulario proibido em codigo e copy.' } },
      create(context) {
        const checa = (texto, node) => {
          if (typeof texto !== 'string') return
          if (RE_TRAVESSAO.test(texto)) context.report({ node, message: MSG_TRAVESSAO })
        }
        const src = context.sourceCode ?? context.getSourceCode()
        return {
          Literal(node) {
            if (typeof node.value === 'string') checa(node.value, node)
          },
          TemplateElement(node) {
            checa(node.value?.cooked ?? node.value?.raw, node)
          },
          JSXText(node) {
            checa(node.value, node)
          },
          Program() {
            for (const c of src.getAllComments()) checa(c.value, c)
          },
        }
      },
    },
  },
}

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', 'supabase/**'],
  },
  ...tseslint.configs.recommended,
  {
    // Linguagem do produto (H13.10): so codigo/copy de PRODUCAO. Exclui:
    // (1) os proprios arquivos de definicao de linguagem (eles LISTAM as
    //     palavras e os travessoes de proposito);
    // (2) testes e fixtures (referenciam palavras/travessao de proposito para
    //     testar o bloqueio).
    files: ['apps/*/src/**/*.ts', 'packages/*/src/**/*.ts'],
    ignores: [
      '**/*.test.ts',
      '**/tests/**',
      '**/test/**',
    ],
    plugins: { linguagem },
    rules: {
      'linguagem/no-vocabulario-proibido': 'error',
    },
  },
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
