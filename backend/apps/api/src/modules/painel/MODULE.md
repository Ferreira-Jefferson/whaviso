# painel

## Propósito
Painel de controle (E9), só leitura por PAPEL:
- GET /v1/painel/resumo: totais POR PAPEL em centavos (a receber/recebido = cobrador;
  a pagar/pago = devedor). Ativos não pagos vêm de `shared/estados.ATIVOS_NAO_PAGOS`
  (fonte única); terminais não-pagos nunca entram. Filtro de período opcional (de/ate, SP).
- GET /v1/painel/pendencias: "precisa de você" (informado_pago como cobrador + edição a
  aprovar como criador), sem dado sensível. dado_incorreto/telefone_divergente: gated (E5).

## Entry points
- `index.ts`: plugin Fastify registrado em `src/routes.ts` sob `/v1`
- `repo.ts`: agregações SQL (totais por papel; pendências)

## Especialistas consumidos
- `@whaviso/shared/contracts`, `@whaviso/shared/db`
- `shared/auth`, `shared/http_errors`

## Tabelas
- lê de: avisos

## Contratos
- payloads em `@whaviso/shared/contracts`
