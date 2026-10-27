# estoque_itens

## Proposito
Controle de estoque POR ITEM do cardapio: liga/desliga o controle, fixa a contagem, lanca
entrada/saida/ajuste, lista itens com estoque baixo e expoe o decremento por venda. Estoque e
CONTAGEM (inteiro), nunca dinheiro.

## Modelo
- `itens.controla_estoque` (bool) + `itens.quantidade_disponivel` (int, NULL = ilimitado; so vale
  com controle ligado; nunca negativo). Colunas adicionadas pela migration `0023_estoque_itens.sql`.
- `movimentos_item_estoque`: diario append-only (entrada/saida/ajuste/venda) com a contagem
  resultante no instante. Sem UPDATE/DELETE (auditoria). Indice unico parcial garante no maximo
  um lancamento `venda` por (pedido, item) = idempotencia da venda.

## Entry points
- `index.ts`: `estoqueItensRoutes` (registry) e `decrementarPorVenda` (funcao pura para o fluxo de pedido).
- Rotas finais (`/v1/estoque_itens`):
  - `GET /` (itens com controle; `?somente_baixos=true&limiar=N`) e `GET /:id` (leitura: pedidos:gerir)
  - `GET /:id/movimentos` (historico; leitura)
  - `PATCH /:id/controle` (liga/desliga + contagem; escrita: loja:gerir)
  - `POST /:id/movimentos` (lancamento manual entrada/saida/ajuste; escrita)

## Regras
- `entrada`/`saida` somam/subtraem a contagem; `ajuste` fixa a contagem (pode zerar). Saida alem do
  disponivel = 422 `estoque_insuficiente`. Lancar em item sem controle = 422 `estoque_sem_controle`;
  entrada/saida em item ilimitado = 422 `estoque_ilimitado` (use ajuste para fixar contagem).
- Toda contagem finita que muda gera um movimento (inclusive ao definir controle = `ajuste`).
- `decrementarPorVenda(exec, { item_id, loja_id, quantidade, pedido_id })`: idempotente por
  (pedido, item), nunca deixa negativo (decrementa ate zero), no-op se sem controle ou ilimitado.
  Rode DENTRO de uma transacao (passe o `client` do `comTransacao`): a trava `FOR UPDATE` depende disso.

## Tabelas
- dono de (escrita): `itens` (so colunas de estoque) e `movimentos_item_estoque` (append-only, sem DELETE).
- `whaviso_atendente`: UPDATE(`quantidade_disponivel`) em `itens` e INSERT/SELECT em
  `movimentos_item_estoque` (o decremento da venda roda no fluxo do atendente).

## Especialistas consumidos
- `@whaviso/shared/db`, `shared/http_errors`, `shared/tenant` (escopo e permissoes via `app.escopoLoja`).

## Contratos
- Zod em `@whaviso/shared/contracts/estoque_itens.ts` (fonte unica; reemitido para o front).
