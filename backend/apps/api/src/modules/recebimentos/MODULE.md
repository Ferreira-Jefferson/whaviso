# recebimentos

## Propósito
Confirmação manual do cobrador: confirmar/desmarcar recebimento; marcar-pago pelo devedor logado; opt-out do devedor logado (encerrar-lembretes: programado→cancelado).

## Entry points
- `index.ts`: plugin Fastify registrado em `src/routes.ts` sob `/v1`

## Especialistas consumidos
- `@whaviso/shared/contracts`, `@whaviso/shared/db`
- `shared/auth`, `shared/http_errors`

## Tabelas
- escreve em: avisos (programado<->pago), eventos_aviso

## Contratos
- payloads em `@whaviso/shared/contracts`
