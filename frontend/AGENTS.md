# AGENTS.md: whaviso/frontend

SPA standalone do whaviso (automatize avisos de pagamento por WhatsApp). Projeto **independente** do backend: React 19 + Vite 7 + TypeScript estrito + Tailwind v4. Não importa `@whaviso/shared`: tem contratos Zod próprios espelhando a `api`.

## Comandos (use o terminal Bash; node/npm não estão no PATH do PowerShell)

```bash
npm install          # se postinstall travar: npm approve-scripts esbuild && npm rebuild esbuild
npm run dev          # Vite em 127.0.0.1:5173 (há outro app no ::1 desta máquina; use 127.0.0.1)
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint + fronteiras feature-first (módulo nunca importa módulo)
npm test             # vitest (inclui o teste de linguagem das Regras de Ouro)
npm run build        # tsc --noEmit && vite build → estáticos em dist/ (deploy via nginx na VPS)
```

Rode `typecheck`, `lint` e `test` a cada mudança.

## Estrutura (feature-first)

```
src/
├── main.tsx                # entry: fontes + index.css + <App/>
├── app/                    # composição: providers, router, guards, layouts
│   └── layouts/            # AppShell (autenticado, por papel) · PublicLayout (max-w-md)
├── modules/                # um slice por feature; NUNCA importa outro módulo
│   ├── auth avisos painel aceite devedor admin billing conta landing
│   └── <mod>/{index.ts (páginas lazy), pages/, MODULE.md}
└── shared/                 # núcleo reutilizável
    ├── contracts/  Zod próprio (espelho do backend; manter em sincronia)
    ├── supabase/   client SÓ-auth (proibido .from()/functions.invoke())
    ├── api_client/ fetch tipado /v1 + Bearer + envelope {error:{code,message}}
    ├── auth/       AuthProvider, useSession, useRole
    ├── format/     brl(), dataPtBR(), telefone(), rótulos de status
    └── ui/         design system "Calmo Editorial"
```

## Fronteiras (enforçadas no lint)

- **Módulo NUNCA importa outro módulo.** Coordene via `@/shared/*` ou contratos.
- `shared/*` não importa módulos nem `app/*`.
- `app/*` pode importar módulos, `shared` e `app`.
- Promoção a `shared/ui` quando 3+ módulos precisarem de um componente.
- Cada módulo expõe `index.ts` (páginas lazy → code-splitting) + `MODULE.md`.

## Regras de Ouro (PROJETO.md, valem também na UI)

- NUNCA "dívida/devendo/atraso/cobrança/inadimplência"; sempre "aviso/lembrete/combinado/acordo". Rótulos centralizados em `shared/format` + `StatusBadge`; o teste `linguagem.test.ts` falha se aparecer palavra proibida.
- Dinheiro em **centavos** (int); único ponto de conversão é `brl()`/`MoneyInput`. Proibido `parseFloat` de valor.
- Datas de negócio em **America/Sao_Paulo** (`shared/format`). Etapa/agendamento nunca calculados no cliente.
- Dados 100% via `api` REST com Bearer do Supabase. Supabase só para login.
- Erros no envelope `{ error: { code, message } }` → `ApiError` (`shared/api_client`).

## Design System: "Calmo Editorial"

Papel/creme + verde-sálvia profundo + serifa humanista (Lora) + sans (Karla). Tokens de cor via `@theme` em `src/index.css`. Botões pill, hairlines em vez de sombras, grain de papel sutil, motion discreto com `prefers-reduced-motion` respeitado. Ícones lucide stroke 1.75.

## Guards (estado atual)

Fase 0: guards **mockados** (`MOCK_GUARDS = true` em `app/guards.tsx`); deixam passar. Forma final pronta; ativar na Fase 1 com fetch real de perfil. Segurança real é RLS + autorização na `api`; guard de frontend é UX.
