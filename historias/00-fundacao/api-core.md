# F4 api-core

- **ID:** F4  ·  **Área:** F  ·  **Onda:** 0
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Entregar o esqueleto da `api` sobre o qual todo módulo `API-*` se pendura: `server.ts`/`app.ts`/
`routes.ts` (registry, **1 linha por módulo**), `http_errors` com o envelope `{ error: { code,
message } }`, `config` validado por Zod, `logger` com redaction de dados sensíveis, e a **fronteira
única de dados `shared/db`** (pool `pg`, SQL padrão, banco trocável por connection string). "Pronto"
observável: `npm run dev:api` sobe em :3001, `GET /healthz` responde, um módulo scaffoldado entra com
uma linha em `routes.ts`, erros saem no envelope padrão, logs nunca mostram segredo, e nenhum módulo
precisa de cliente Supabase/PostgREST para falar com o banco.

## Dependências

- `F0`: banco, roles (`whaviso_api`) e `check_rls_coverage`.
- `F1`: `ErroApi`, primitivos e a convenção de DTO usada nos schemas de rota.
- `F3`: plugins de autenticação e escopo (`autenticar`, `escopoLoja`, `escopoOperador`) que o app registra.

## Contratos e tabelas que toca

- Nenhuma tabela de negócio. Conecta como role `whaviso_api` (privilégio mínimo; sem DELETE em
  negócio/auditoria, exceção `templates`).
- Contratos: `ErroApi`, `HealthDto`. Eventos NOTIFY não são deste módulo (F5).
- Convenções que o core impõe: dinheiro em centavos, datas UTC no banco/ISO no contrato, SQL sempre
  parametrizado.

## Arquivos (escopo de edição)

- `backend/apps/api/src/{server.ts,app.ts,routes.ts,env.ts}` (env.ts pode virar usar `shared/config`)
- `backend/apps/api/src/shared/http_errors/**`
- `backend/apps/api/src/shared/db_hooks/**` (ganchos de transação por requisição, se necessário)
- `backend/packages/shared/src/db/**` (pool, `consultar`, `transacao`, helpers)
- `backend/packages/shared/src/logger/**` (redaction)
- `backend/packages/shared/src/config/**` (loader Zod)
- `backend/scripts/scaffold_module.sh` (atualizar para o layout novo: fatia api com 1 linha no registry)
- `backend/apps/api/AGENTS.md` ou seção em `backend/AGENTS.md` (fiação em 1 página)
- Módulos legados de cobrança em `apps/api/src/modules/**` **não** são tocados aqui (ver Notas).

## Etapas

- [ ] 1. Inventário do `apps/api` atual (app/routes/env/server): o que reaproveitar, o que apagar quando
  os módulos legados de cobrança forem removidos. Registrar em Notas.
  (commit: `chore(api): inventario do esqueleto atual`)
- [ ] 2. `shared/config`: loader Zod com tipos para api (`API_*`), zap e atendente; falha no boot com
  mensagem clara listando as variáveis ausentes (sem ecoar valores). Inclui `DATABASE_URL`, `APP_URL`,
  `SUPABASE_JWKS_URL`, `SUPABASE_ISSUER`, `MASTER_KEY` (referência, uso em módulos de segredo).
  (commit: `feat(shared): config tipado e validado por zod`)
- [ ] 3. `shared/logger` (pino) com **redaction** por caminho e por nome de campo, recursiva em objetos
  aninhados: `authorization`, `cookie`, `token`, `chave`, `chave_cifrada`, `senha`, `telefone`,
  `numero`, `pix`, `titular`, `*_hash` onde sensível. Serializers de `req`/`res` sem headers sensíveis.
  (commit: `feat(shared): logger com redaction de dados sensiveis`)
- [ ] 4. Testes do logger: injeta segredo conhecido em níveis diferentes de aninhamento e em
  `err.config`/`req.headers`; afirma que a saída não contém o valor. (SEC-024)
  (commit: `test(shared): redaction do logger (SEC-024)`)
- [ ] 5. `shared/db`: pool `pg` único por processo (tamanho e timeouts por config), `consultar(sql,
  params)`, `transacao(fn)` com rollback garantido, tipagem de linha por Zod opcional, tradução de
  erros `pg` (unique/fk/check) para erros de domínio. **Somente `pg`**; nenhum import de `@supabase/*`.
  (commit: `feat(shared): fronteira unica de dados shared/db`)
- [ ] 6. Guarda de parametrização: helper `sql` (tagged template que só aceita valores como parâmetros)
  e regra de lint/teste que falha ao achar concatenação de string em `consultar(`. (SEC-080)
  (commit: `feat(shared): sql parametrizado por construcao e lint de interpolacao`)
- [ ] 7. `http_errors`: classes de erro de domínio (`NaoEncontrado`, `Proibido`, `Invalido`,
  `Conflito`, `Interno`) e `errorHandler` do Fastify que converte para `{ error: { code, message } }`,
  traduz erro Zod (422/400 sem vazar o schema interno), nunca devolve stack nem mensagem de `pg`.
  (commit: `feat(api): envelope de erro padrao e error handler`)
- [ ] 8. `app.ts`: factory `construirApp(deps)` (testável sem rede): Fastify + `fastify-type-provider-zod`
  (validação na borda, SEC-081), logger, `helmet` e CORS restrito a `APP_URL`, `rate-limit` base,
  `errorHandler`, plugins de F3, `/healthz` (verifica `select 1`). (commit: `feat(api): app factory com seguranca de borda`)
- [ ] 9. `routes.ts` como registry: array de módulos `{ prefixo, plugin }`, **1 linha por módulo**; teste
  que falha se o registry tiver rota duplicada de prefixo. Módulo de exemplo `exemplo` só em teste.
  (commit: `feat(api): registry de rotas, uma linha por modulo`)
- [ ] 10. `server.ts`: boot, graceful shutdown (fecha pool e servidor), tratamento de `unhandledRejection`
  sem vazar dado. (commit: `feat(api): server com graceful shutdown`)
- [ ] 11. Cabeçalhos de segurança e CORS: testes (HSTS, CSP adequada a API JSON, `X-Content-Type-Options`,
  origem estranha negada). (SEC-090)
  (commit: `test(api): headers e cors (SEC-090)`)
- [ ] 12. Rate limit nos endpoints sensíveis (parametrizável por rota) + teste. (SEC-101, base)
  (commit: `feat(api): rate limit configuravel por rota`)
- [ ] 13. Atualizar `scaffold_module.sh api <nome>`: gera `modules/<nome>/{routes,service,repo,schemas,
  MODULE.md,*.test.ts}` e imprime a linha para `routes.ts`; usa o layout novo. Teste de fumaça do script.
  (commit: `chore(scripts): scaffold de modulo api no layout novo`)
- [ ] 14. Lint de fronteiras: módulo não importa módulo; módulo só acessa dados via `shared/db`; nada
  importa `@supabase/*` em `modules/**`. (commit: `chore(backend): lint de fronteiras da api`)
- [ ] 15. Testes de integração: sobe o app contra `whaviso_dev`, `/healthz` 200, erro 404 no envelope,
  payload inválido 4xx no envelope, rota protegida 401 sem token.
  (commit: `test(api): integracao do esqueleto`)
- [ ] 16. Documentar em AGENTS.md: como criar módulo, regra de db, regra de erro, regra de log.
  (commit: `docs(api): guia de fiacao do core`)
- [ ] 17. `npm run lint`, `typecheck`, `test` verdes; `curl 127.0.0.1:3001/healthz`.

## Testes e segurança exigidos

- Unidade: config (ausente/inválido falha no boot), logger (redaction), `db` (transação faz rollback em
  erro, tradução de erros `pg`), `http_errors` (mapeamento), registry (prefixo duplicado).
- **SEC-024**: redaction cobre `chave`, `token`, `authorization` e aninhados.
- **SEC-080**: nenhuma query por interpolação; teste com entrada maliciosa não altera a query.
- **SEC-081**: payload fora do contrato (tipo, tamanho, enum, chave extra) é rejeitado na borda.
- **SEC-090**: HSTS, CSP, headers e CORS restrito ao `APP_URL`.
- **SEC-101** (base): rate limit configurável e testado.
- **SEC-010/011** continuam garantidos pelo banco; o core confirma que conecta como `whaviso_api` e não
  como superusuário (teste afirma `current_user`).

## Notas e decisões

- `packages/shared/src/{db,logger,config}` já existem (código da era da cobrança). Decisão: reaproveitar
  o que for genérico (pool, pino) e reescrever o que tiver acoplamento de domínio; nada de regra de
  negócio no kernel. Remoções de legado só quando não houver consumidor.
- Os módulos legados de cobrança em `apps/api/src/modules` ficarão sem fiação; **não** são apagados
  nesta tarefa. A limpeza é um commit separado coordenado (registrar e perguntar ao dono) para não
  quebrar o lint/typecheck do gate no meio da onda.
- Banco trocável: o contrato é "string de conexão + SQL padrão". Nada de `supabase-js`/PostgREST no
  caminho de dados; Supabase só serve Auth (JWKS). Documentar no AGENTS.md.
- Hardening opcional por GUC (RLS real por loja) fica fora do escopo; o `transacao` já aceita um gancho
  de `SET LOCAL` para adotar depois sem mudar consumidores.
- Escopo de loja chega de F3; o core não implementa política de papel.
