# F5 realtime-sse

- **ID:** F5  ·  **Área:** F  ·  **Onda:** 0
- **Modelo sugerido:** Sonnet  ·  **Status:** `CONCLUIDO (aguardando revisao)`
- **Reivindicado por:** F5-agent

## Objetivo

Entregar o realtime da `api`: um endpoint SSE por loja alimentado por `LISTEN/NOTIFY` do Postgres, sem
Redis e sem Realtime do Supabase. Kanban de pedidos e conversas passam a atualizar ao vivo no lugar do
polling. "Pronto" observável: um `NOTIFY` (ou um módulo chamando o publicador) numa loja chega como
evento SSE só aos clientes autenticados daquela loja, com reconexão e retomada por `Last-Event-ID`;
membros de outra loja e operadores nunca recebem; conexões mortas são limpas; muitas conexões de uma
instância compartilham **uma** conexão `LISTEN`.

## Dependências

- `F4`: app Fastify, `shared/db`, logger, erros e o plugin de escopo de loja (F3, via F4).
- (F1 já está coberto transitivamente: contratos `CanalRealtime`/`EventoDominio`.)

## Contratos e tabelas que toca

- Lê/escreve nenhuma tabela de negócio. Usa o canal Postgres `whaviso_eventos` (um canal, payload JSON
  pequeno com `loja_id`, `tipo`, `ref` e `id` monotônico; o payload **não carrega PII nem o dado
  completo**, só o suficiente para o front invalidar a query ou buscar o recurso). Limite de 8000 bytes
  do NOTIFY respeitado.
- Contratos (de F1): `CanalRealtime`, `EventoDominio`. Rota: `GET /realtime/stream` (SSE).
- Tabela `eventos` (append-only) **não** é a fila do realtime; o NOTIFY é efêmero. Reconexão após queda
  longa é resolvida pelo front refazendo a query (ver Notas), não por replay do banco.

## Arquivos (escopo de edição)

- `backend/apps/api/src/shared/realtime/**` (hub, publicador, plugin SSE)
- `backend/packages/shared/src/db/notify.ts` (helper `notificar` e conexão dedicada de LISTEN)
- `backend/apps/api/src/routes.ts` (apenas 1 linha de registro do plugin, se F4 já o tem como módulo-infra)
- `backend/packages/shared/src/contracts/realtime.ts` (se ajuste for necessário; senão só consome F1)

## Etapas

- [x] 1. Helper de publicação `notificar(canal, payload)` em `shared/db`: valida payload contra
  `EventoDominio` (strict, sem PII), serializa, garante `< 8000 bytes`, executa `pg_notify`.
  (commit: `feat(shared): publicador pg_notify validado por contrato`)
- [x] 2. Conexão dedicada de LISTEN (fora do pool de requisições) com **reconexão** e backoff, reinscrição
  em `LISTEN` após queda, e evento interno "reconectou" para os clientes saberem que podem ter perdido
  eventos. (commit: `feat(shared): conexao LISTEN dedicada com reconexao`)
- [x] 3. Hub em memória: um `EventEmitter` por instância que recebe cada notificação, e roteia por
  `loja_id` para os assinantes; limites de assinantes por loja e por usuário (anti-abuso, SEC-101).
  (commit: `feat(api): hub de realtime por loja`)
- [x] 4. Plugin SSE `GET /realtime/stream`: autenticado e com escopo de loja de F3; o `loja_id` ativo é
  validado contra o conjunto do usuário; headers corretos (`text/event-stream`, `no-cache`, `X-Accel-
  Buffering: no` para nginx), **heartbeat** a cada ~25s (comentário SSE), `id:` por evento e suporte a
  `Last-Event-ID` (descarta se muito antigo e emite `evento: resync`).
  (commit: `feat(api): endpoint SSE por loja`)
- [x] 5. Filtro de autorização por evento: só entrega se `evento.loja_id` estiver no escopo do cliente
  **e** o papel do usuário puder ver aquele tipo (ex.: atendente não recebe evento de cobrança). Operador
  nunca recebe eventos de conteúdo de loja. (commit: `feat(api): autorizacao por evento no realtime`)
- [x] 6. Ciclo de vida: remover assinante ao fechar a conexão (`close`/`error`), limpar timers, graceful
  shutdown envia evento de fim e fecha. Sem vazamento de listeners.
  (commit: `feat(api): ciclo de vida e shutdown das conexoes SSE`)
- [x] 7. Teste de unidade do hub (roteamento, limites, remoção) e do publicador (rejeita PII, tamanho).
  (commit: `test(api): hub e publicador de realtime`)
- [x] 8. Teste de integração contra `whaviso_dev`: duas lojas, dois clientes SSE, `NOTIFY` da loja A chega
  só ao cliente A; derrubar a conexão LISTEN e ver reconexão + evento `resync`.
  (commit: `test(api): isolamento e reconexao do realtime (SEC-001)`)
- [x] 9. Teste de carga leve: 200 conexões simuladas usam 1 conexão LISTEN e memória estável.
  (commit: `test(api): carga leve do realtime`)
- [x] 10. Documentar em AGENTS.md/MODULE.md: como um módulo publica (`notificar`), contrato do evento,
  regra "evento carrega referência, não dado". Configuração nginx de SSE anotada para a VPS.
  (commit: `docs(api): guia de realtime`)
- [x] 11. `npm run lint`, `typecheck`, `test` verdes.

## Testes e segurança exigidos

- Unidade: hub, publicador (PII e tamanho), parser de `Last-Event-ID`, limites.
- **SEC-001** (realtime): cliente da loja A nunca recebe evento da loja B, nem com `loja_id` forjado na
  query/header; evento sem `loja_id` é descartado.
- **SEC-003**: escopo de operador não assina canal de conteúdo de loja.
- **SEC-040**: conexão SSE sem token ou com token inválido/expirado é 401; token que expira durante a
  conexão encerra o stream (verificação periódica de `exp`).
- **SEC-101**: limite de conexões por usuário/loja; excedente recebe 429.
- **SEC-024**: payloads do NOTIFY e logs do hub não contêm telefone, token ou chave.

## Notas e decisões

- **Implementacao (F5-agent):** `notificar(exec, evento)` e a conexao LISTEN (`criarEscuta`) vivem em `packages/shared/src/db/{notify,listen}.ts` (reexportados por `@whaviso/shared/db`); hub, permissoes por tipo e plugin SSE em `apps/api/src/shared/realtime/`; registrado em `app.ts` (nao em `routes.ts`, pois nao e modulo `/v1`). `DATABASE_URL_LISTEN` (opcional) adicionada a `envApiSchema`. Contratos de F1 reusados sem alteracao (o envelope nao tem `id`/`ref`: o id monotonico `<epoca>-<seq>` e atribuido pelo hub no SSE).
- Loja ativa: header `x-loja-id` validado pelo F3 (fora do escopo = 404); sem header, o stream cobre todas as lojas do usuario.
- `exp` do token e lido do JWT ja verificado por `autenticar` (o `Verificador` devolve so `sub`); sem `exp` = 401 (fail closed). Timer unico ate o `exp` encerra o stream com `fim`.
- LISTEN abre sob demanda no 1o cliente SSE (testes e instancias sem clientes nao tocam o banco).
- Resposta SSE usa `Connection: close` para nao deixar socket ocioso pendurado no shutdown.

- Token do EventSource: `EventSource` do browser não envia header `Authorization`. Decisão: o front usa
  `fetch` com stream (biblioteca leve) para enviar o Bearer, em vez de colocar JWT em query string (que
  vazaria em log de proxy). Registrar e alinhar com F6. Alternativa descartada: cookie de sessão.
- Garantia de entrega é **at-most-once** e efêmera por desenho: o evento é um aviso de "algo mudou". O
  front, ao receber `resync` ou reconectar, refaz a query (TanStack Query `invalidate`). Evita fila e
  Redis.
- Uma instância da api = uma conexão LISTEN. Se houver mais de uma instância, cada uma escuta; sem broker
  extra. Pooler em modo transação (pgbouncer) **não** suporta LISTEN: a conexão de LISTEN usa a connection
  string direta/session. Anotar na config (`DATABASE_URL_LISTEN`).
- Quem dispara NOTIFY: módulos da api e o `atendente`/`zap` (que escrevem direto no banco) podem usar um
  trigger SQL ou o helper `notificar`. Triggers exigiriam migration (fora do escopo de F5; se desejado,
  vira tarefa do módulo dono da tabela, ex.: API-pedidos/API-conversas).
