# whaviso: guia para agentes

Automatize avisos de pagamento por WhatsApp. Visão de produto em [PROJETO.md](PROJETO.md).
**Regras de ouro do produto:** nunca usar "dívida/devendo/atraso/cobrança/inadimplência"; opt-out sempre visível; ciclo encerra para sempre em estado terminal; devedor só interage por botões.

## Layout (monorepo npm workspaces, feature-first)

```
apps/api/          serviço que atende o SPA (porta 3001): Fastify + Zod
apps/zap/          serviço WhatsApp (porta 3002): scheduler + webhook Meta Cloud API
packages/shared/   @whaviso/shared: especialistas comuns aos apps
supabase/          migrations + seed (Supabase = Postgres + Auth, nada mais)
scripts/           scaffold_module.sh
```

Cada app segue: `src/server.ts` (boot) · `src/app.ts` (monta Fastify) · `src/routes.ts` (registry: 1 linha por módulo) · `src/shared/<especialista>/` · `src/modules/<feature>/` (cada módulo tem `MODULE.md`).

## Fronteiras (verificadas pelo ESLint, `npm run lint`)

- **Módulo nunca importa módulo.** Coordenação entre features passa pelo banco (outbox `envios`) ou por contrato em `@whaviso/shared/contracts`.
- Módulo pode importar: `shared/` do próprio app e `@whaviso/shared/*`.
- Consuma especialistas pela API pública (`index.ts` da pasta), nunca por arquivo interno.
- Arquivos ≤300 linhas (exceto migrations/fixtures); módulo ≤~600 linhas.

## Especialistas disponíveis (reusar, nunca reescrever)

| Onde | Especialista | O que dá |
|---|---|---|
| `@whaviso/shared/contracts` | contratos | enums, schemas Zod (Aviso, Envio, Evento, payloads REST), `PALAVRAS_PROIBIDAS` |
| `@whaviso/shared/db` | banco | `criarPool(env)`, `comTransacao(pool, fn)` (pg) |
| `@whaviso/shared/logger` | log | `criarLogger(nome)` (pino) |
| `@whaviso/shared/config` | env | `parseEnv(schema)`: crash no boot se env inválido |
| `@whaviso/shared/datas` | datas/TZ | TZ fixo America/Sao_Paulo, `calcularAgendamentos`, `hojeSp`, `fimDoDiaSp` |
| `apps/api/src/shared/auth` | auth | plugin JWKS Supabase; decora `userId`/`role`; `requireRole()` |
| `apps/api/src/shared/tokens` | tokens | `gerarToken()` (base64url 32B), `sha256Hex()` |
| `apps/api/src/shared/http_errors` | erros HTTP | envelope `{error:{code,message}}` + handler global |
| `apps/zap/src/shared/meta_client` | Meta API | `enviarTemplate()`, `enviarTexto()`, `verificarAssinatura(rawBody)` |

## Comandos

```bash
npm install                 # raiz; instala todos os workspaces
npm run lint                # ESLint + fronteiras (boundaries)
npm run typecheck           # tsc --noEmit em todos os workspaces
npm test                    # vitest nos workspaces que têm testes
npm run dev:api             # api em watch na 3001
npm run dev:zap             # zap em watch na 3002
./scripts/scaffold_module.sh <app> <nome_modulo>   # novo módulo
supabase start && supabase db reset                 # banco local + migrations + seed
```

Runtime: **tsx** (dev e prod); não há passo de emit; "build" = lint + typecheck.

## Convenções

- TypeScript estrito, ESM, Zod em toda entrada externa (env, body, params, webhook).
- Dinheiro sempre em **centavos** (int). Datas de negócio em **America/Sao_Paulo**; timestamps no banco em UTC.
- Tabela tem módulo dono (único que escreve via api); leitura cruzada via `@whaviso/shared/db` é permitida e documentada no MODULE.md.
- Nunca armazenar token em claro, só hash sha256. Nunca logar telefone/Pix completos.
- Erros da api: envelope `{error:{code,message}}`; códigos estáveis em snake_case.
