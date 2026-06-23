# avisos

## Propósito
CRUD de avisos: criar (gera tokens + link de aceite, valida limite do plano), listar, detalhar, cancelar.

## Entry points
- `index.ts`: plugin Fastify registrado em `src/routes.ts` sob `/v1`

## Especialistas consumidos
- `@whaviso/shared/contracts`, `@whaviso/shared/db`
- `shared/auth`, `shared/http_errors`

## Tabelas
- dono de: avisos, eventos_aviso (insert)
- lê de: assinaturas, planos (limite do plano)

## Contratos
- payloads em `@whaviso/shared/contracts`
