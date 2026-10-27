# ficha_tecnica

## Proposito
A ficha tecnica (receita) de um item do cardapio: a lista de insumos que ele consome, com a
`quantidade` consumida por UMA unidade vendida. E a ponte entre o cardapio (item) e o estoque de
insumos: no momento da venda, a ficha diz quanto baixar de cada insumo.

## Entry points
- `index.ts`: `fichaTecnicaRoutes` (registry) e `darBaixaPorVenda` (funcao pura de baixa na venda).
- Rotas finais (`/v1/ficha-tecnica`):
  - `GET /itens/:itemId`  -> ficha vigente do item (linhas ativas). Qualquer membro da loja.
  - `PUT /itens/:itemId`  -> define/substitui a ficha (lista inteira). Dono/gerente (`loja:gerir`).

## Tabelas
- Dona (escrita pela api): `fichas_tecnicas` (migration 0027).
  - Esquema: `id, loja_id, item_id -> itens, insumo_id -> insumos, quantidade numeric(14,3) > 0,
    ativo, criado_em`. Unicidade `(item_id, insumo_id)`. Sem DELETE (SEC-030): remover um insumo e
    `ativo = false` (readicionar reativa a mesma linha). `PUT` vazio desativa todas as linhas.
- Le/escreve por SQL direto (modulo nunca importa modulo -> nao importa `estoque_insumos`), tabelas
  da migration **0026**:
  - `public.insumos`: le `id, loja_id` (guarda de pertencimento) e `quantidade_atual`
    (decrementada na baixa, sem deixar negativo).
  - `public.movimentos_insumo`: insere `tipo = 'consumo'` com colunas
    `loja_id, insumo_id, tipo, quantidade, quantidade_resultante, pedido_id`.
- Escreve: `eventos` (`ficha_tecnica.definida`, entidade `item`; `detalhes` so com `user_id` e a
  contagem de linhas, sem PII).

## Dependencia da 0026 (contrato com o modulo de estoque)
Esta migration (0027) referencia `public.insumos` por FK; so aplica DEPOIS da 0026. A baixa por
venda exige, nas tabelas da 0026, que o role executor tenha: `SELECT, UPDATE` em `insumos` e
`SELECT, INSERT` em `movimentos_insumo`. O `whaviso_api` (0026) tem exatamente isso, entao
`darBaixaPorVenda` roda sob a api. Atencao: na 0026 o `whaviso_atendente` recebe apenas
`UPDATE(quantidade_atual)` em `insumos` e `INSERT` em `movimentos_insumo` (sem SELECT em
`movimentos_insumo`); como a guarda de idempotencia desta funcao LE `movimentos_insumo`, ela nao
roda sob o atendente sem um grant de SELECT. Se a baixa precisar rodar no fluxo do atendente, 0026
deve conceder `SELECT` em `movimentos_insumo` ao `whaviso_atendente`, ou o atendente usa uma guarda
de idempotencia que nao leia essa tabela (ex.: marca no pedido).

## darBaixaPorVenda (funcao pura)
`darBaixaPorVenda(exec, { item_id, loja_id, quantidade_vendida, pedido_id })` recebe o executor
(pode ser o client de uma transacao do chamador). Para cada linha ativa da ficha:
`consumo = quantidade_por_unidade * quantidade_vendida`; decrementa `insumos.quantidade_atual` com
`greatest(..., 0)` (nunca negativo) e grava `movimentos_insumo` `consumo` com a quantidade
resultante, tudo numa CTE atomica. **Idempotente por `(pedido_id, insumo_id)`**: reexecutar o mesmo
pedido nao da baixa em dobro. Limitacao conhecida: a idempotencia e por `(pedido, insumo)`, entao se
duas linhas de pedido do mesmo pedido compartilham o mesmo insumo, a baixa registra o primeiro
consumo e o `pedido_id` ja marca o insumo; o integrador de pedidos deve agregar o consumo por insumo
antes de chamar, ou chamar uma vez por item com consumo ja somado.

## Contratos
- Zod em `@whaviso/shared/contracts/ficha_tecnica.ts` (reemitido para o front). `quantidade` e
  numero positivo (decimal, nao centavos); `FichaTecnicaEntrada` rejeita `insumo_id` repetido.

## Regras / seguranca
- Multi-tenant: toda consulta filtra por `loja_id` do escopo; item e insumos sao checados como
  pertencentes a loja (SEC-001/002). `loja_id` nunca vem do corpo/query.
- Edicao exige `loja:gerir` (dono/gerente); leitura, qualquer membro. O atendente le a ficha no app
  dele direto no banco (grant SELECT), nao por esta api.
