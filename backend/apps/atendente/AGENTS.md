# apps/atendente

Worker que conduz o pedido por WhatsApp com um motor **deterministico** (botoes e regras, **sem
LLM**). Consome o inbound enfileirado pelo zap e fecha o laco do pedido: inbound -> pedido `novo` no
kanban -> resposta em `envios` (o zap entrega). Conecta ao banco como `whaviso_atendente` (privilegio
minimo). Independente da api e do zap: fala so pelo banco compartilhado (outbox), nunca importa outro
app.

## Estrutura

- `src/server.ts` boot (valida env, abre pool, monta e valida o registry, sobe o laco de drenagem).
- `src/scheduler.ts` ticks encadeados (nao se sobrepoem); `src/saude.ts` health `/healthz`.
- `src/modules/motor_fluxo/` o motor (ver `MODULE.md`): grafo fixo, nodes, claim, efeitos.
- `src/shared/llm_client/` stub de `ClienteLLM` (reservado para a onda 2; o motor-min nao usa).

## Fronteiras (ESLint)

Modulo nunca importa modulo; dados so via `@whaviso/shared/db` (SEC-080); nenhum `pg`/`@supabase/*`
direto. Nodes nao se importam entre si (o compartilhado mora em `comum`/`ids`/`acoes`).

## Comandos

```bash
npm run typecheck -w @whaviso/atendente
cd apps/atendente && npx vitest run     # testes de integracao no Postgres local (PGDATABASE)
```
