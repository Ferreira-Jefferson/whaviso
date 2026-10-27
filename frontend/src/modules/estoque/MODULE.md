# estoque (frontend)

## Proposito
Controle de estoque da loja ativa. Duas secoes numa so tela (`/estoque`), via `SegmentedControl`:
- **Insumos**: lista da materia-prima (arroz, carne, embalagem...) com saldo, unidade, estoque
  minimo, custo por unidade (em centavos) e destaque quando o saldo esta abaixo do minimo.
  Criar/editar insumo e registrar movimento (entrada/saida/ajuste) por dialog.
- **Fichas tecnicas**: por item do cardapio, a lista de `{insumo, quantidade}` que uma unidade
  vendida consome (para dar baixa no estoque na venda). Editar = substituir a ficha inteira.

## Entry points
- `index.ts`: export default da pagina (para `lazy(() => import('@/modules/estoque'))` no registry).

## Dados (`api.ts`, raiz de cache `['estoque']`)
- Insumos: `GET /v1/estoque-insumos` (`?incluir_inativos`), `POST /v1/estoque-insumos`,
  `PATCH /v1/estoque-insumos/:id`, `GET /v1/estoque-insumos/:id/movimentos`,
  `POST /v1/estoque-insumos/movimentos` (entrada/saida/ajuste; `insumo_id` no corpo).
- Ficha tecnica: `GET /v1/ficha-tecnica/itens/:itemId`, `PUT /v1/ficha-tecnica/itens/:itemId`.
- Itens do cardapio (so para o seletor da ficha): `GET /v1/cardapio` via `useItensCardapio`, que
  achata a arvore resolvida em `{ id, nome, categoria }` (so itens ativos). E chamada HTTP +
  contrato `_generated/cardapio`, nao import do slice cardapio ("modulo nao importa modulo" vale
  para CODIGO). Cache `['cardapio','itens-para-ficha']`.
- Contratos: `@/shared/contracts/_generated/estoque_insumos` e `.../ficha_tecnica` (nao redefinir).
- Toda mutacao de insumo/movimento invalida `['estoque']`; a ficha invalida so `['estoque','ficha',itemId]`.

## Notas
- **Dinheiro vs quantidade**: custo do insumo e CENTAVOS (`MoneyInput`/`MoneyText`). Quantidade
  (saldo, minimo, linhas da ficha) e decimal `numeric(14,3)`, NAO e dinheiro: formatada por
  `formatarQuantidade` e lida por `parseQuantidade` (aceita virgula ou ponto), ambos em `estados.ts`.
- `abaixo_minimo` vem resolvido do servidor na propria lista de insumos; o destaque e o contador
  de "estoque baixo" sao derivados dessa flag (o endpoint `/baixo-estoque` existe mas e redundante
  com a flag da lista, entao nao e chamado aqui).
- O endpoint de ajuste DEFINE o saldo (recontagem); entrada soma e saida subtrai. O tipo `consumo`
  e so do fluxo de venda (servidor), nao aparece no seletor do painel.
- A ficha tecnica e escolhida num seletor de itens do cardapio (GET /cardapio, achatado). O
  "estoque por item do cardapio" (contrato `estoque_itens`) NAO e coberto aqui: fica na tela de
  cardapio.
- Primitivos candidatos a `@/shared/ui`: um campo de quantidade decimal (hoje um `Input` com
  `inputMode="decimal"` + `parseQuantidade`) seria o par natural do `MoneyInput` para medidas.
