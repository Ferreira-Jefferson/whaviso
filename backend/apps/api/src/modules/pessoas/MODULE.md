# pessoas

## Propósito
Visão de contato (E15): reúne os combinados do usuário com uma mesma pessoa, sendo a
IDENTIDADE o TELEFONE da outra ponta (o nome é só rótulo). Só leitura + solicitação.
- GET /v1/pessoas/:avisoId/resumo: telefone da outra ponta resolvido NO SERVIDOR a partir
  de um combinado do usuário (UUID na rota, telefone nunca em rota/log, H13.8/H15.7) +
  os QUATRO totais (a receber/recebido como cobrador; a pagar/pago como devedor, H15.2),
  coerentes com o painel (`shared/estados.ATIVOS_NAO_PAGOS`).
- GET /v1/pessoas/:avisoId/combinados: todos os combinados daquele número, AGRUPADOS POR
  NOME (H15.3); itens no formato `avisoSchema` (o front reusa as colunas do painel).
- POST /v1/pessoas/buscar-por-telefone: autocomplete ao criar (H15.6). O número (parcial)
  vai no CORPO, nunca em query/URL; devolve `{ nome, telefone }` dos combinados que o
  próprio usuário criou e cujo número bate com o prefixo.

## Entry points
- `index.ts`: plugin Fastify registrado em `src/routes.ts` sob `/v1`
- `service.ts`: resolve a pessoa (telefone no servidor) e agrupa por nome
- `repo.ts`: agregações SQL (totais por pessoa; combinados por telefone; busca por prefixo)

## Especialistas consumidos
- `@whaviso/shared/contracts`, `@whaviso/shared/db`
- `shared/auth`, `shared/http_errors`, `shared/estados`

## Tabelas
- lê de: avisos

## Contratos
- payloads em `@whaviso/shared/contracts` (pessoaResumoResposta, pessoaCombinadosResposta,
  buscarPessoaBody/Resposta)
