# itens

## Propósito
Autocomplete do nome do item ao montar o pedido de um combinado. Como o valor do combinado é
DERIVADO da soma dos itens, o dono monta o pedido com frequência repetindo os mesmos produtos;
este módulo sugere descrições já usadas por ele.
- POST /v1/itens/buscar-por-nome: recebe um prefixo no CORPO (consistência com
  pessoas/buscar-por-telefone; corpo não é logado) e devolve as descrições DISTINTAS de itens
  já usadas em combinados que o próprio usuário criou e que batem com o prefixo (`{ itens: string[] }`).

## Entry points
- `index.ts`: plugin Fastify registrado em `src/routes.ts` sob `/v1`
- `service.ts`: passthrough para o repo
- `repo.ts`: unnest do jsonb `avisos.itens` + escopo do criador + prefixo (LIKE)

## Especialistas consumidos
- `@whaviso/shared/contracts`, `@whaviso/shared/db`
- `shared/auth`

## Tabelas
- lê de: avisos (coluna itens jsonb)

## Contratos
- payloads em `@whaviso/shared/contracts` (buscarItemBody/buscarItemResposta)
