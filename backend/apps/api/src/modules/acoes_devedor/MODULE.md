# acoes_devedor

## Propósito
POST /v1/acao/:token (público): ja_paguei / optout vindos da página do devedor; idempotente por estado.

## Entry points
- `index.ts`: plugin Fastify registrado em `src/routes.ts` sob `/v1`

## Especialistas consumidos
- `@whaviso/shared/contracts`, `@whaviso/shared/db`
- `shared/auth`, `shared/http_errors`

## Tabelas
- escreve em: avisos (transição), eventos_aviso

## Contratos
- payloads em `@whaviso/shared/contracts`
