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

// Regra de escrita do repositorio: barra travessao (em/en dash). O vocabulario proibido
// da era cobranca (divida/atraso/cobranca/inadimplencia) foi REMOVIDO no pivo: "cobranca"
// agora e termo de dominio legitimo (billing da plataforma). Regras de copy do produto
// novo virao do modulo de compliance/atendente, nao deste lint.
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
    // src/qa: harness de QA visual (dev-only, fora do build de producao). Nao segue as
    // fronteiras feature-first (monta o shell real com providers fakes de proposito).
    ignores: ['**/node_modules/**', '**/dist/**', 'vite.config.ts', 'src/shared/contracts/_generated/**', 'src/qa/**'],
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
    // Linguagem do produto (H13.10): so codigo/copy de PRODUCAO. Exclui:
    // (1) o proprio arquivo de definicao de linguagem (LISTA as palavras e os
    //     travessoes de proposito);
    // (2) testes e fixtures (referenciam palavras/travessao de proposito para
    //     testar o bloqueio).
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      '**/contracts/linguagem.ts',
      '**/*.test.{ts,tsx}',
      '**/tests/**',
      '**/test/**',
    ],
    plugins: { linguagem },
    rules: {
      'linguagem/no-vocabulario-proibido': 'error',
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
  {
    // F1 (independencia de deploy): o front NAO importa @whaviso/shared; os contratos vem
    // de src/shared/contracts/_generated (reemitidos por `npm run gen:contracts` no backend).
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@whaviso/shared', '@whaviso/shared/*'],
              message:
                'O front nao importa @whaviso/shared; use src/shared/contracts/_generated (npm run gen:contracts).',
            },
          ],
        },
      ],
    },
  },
)
