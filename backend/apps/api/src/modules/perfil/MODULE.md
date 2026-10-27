# perfil

## Propósito
- GET/PATCH /v1/perfil: dados do usuário logado (nome, telefone).

## Entry points
- `index.ts`: plugin Fastify registrado em `src/routes.ts` sob `/v1`

## Especialistas consumidos
- `@whaviso/shared/contracts`, `@whaviso/shared/db`
- `shared/auth`, `shared/http_errors`

## Tabelas
- dono de: profiles

## Contratos
- payloads em `@whaviso/shared/contracts`
