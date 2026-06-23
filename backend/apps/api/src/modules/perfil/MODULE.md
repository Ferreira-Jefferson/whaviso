# perfil

## Propósito
- GET/PATCH /v1/perfil: dados do usuário logado (nome, telefone).
- GET/POST /v1/perfil/chaves-pix e PATCH /v1/perfil/chaves-pix/:id: chaves Pix do
  usuário (N por perfil, 1 padrão). "Remover" = soft-delete (arquivada=true).

## Entry points
- `index.ts`: plugin Fastify registrado em `src/routes.ts` sob `/v1`

## Especialistas consumidos
- `@whaviso/shared/contracts`, `@whaviso/shared/db`
- `shared/auth`, `shared/http_errors`

## Tabelas
- dono de: profiles, chaves_pix (escrita via api)

## Contratos
- payloads em `@whaviso/shared/contracts`
