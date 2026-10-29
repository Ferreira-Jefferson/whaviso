-- Idempotencia da CRIACAO de pedido: fecha a janela de duplo-clique/retry em POST /pedidos e
-- POST /pedidos/:id/repetir. O retry interno do codigo diario (indice pedidos_codigo_loja, 0005) so
-- resolve colisao de SEQUENCIA incrementando o numero; NUNCA deduplica. Dois submits concorrentes ou
-- repetidos (timeout + retry do cliente, duplo-clique) viravam 2 pedidos distintos e, como a baixa de
-- estoque e um trigger na efetivacao (0055), duplicavam estoque e faturamento. A chave vem do cliente
-- (um UUID por submit, reusado no retry); quando presente, o reenvio com a mesma chave e no-op (a api
-- devolve o pedido original). Espelha movimentos_caixa (0064) e contas_pagar (0067).
--
-- Grants: pedidos ja concede select/insert/update a whaviso_api e whaviso_atendente em NIVEL DE
-- TABELA (0005), que cobre colunas novas automaticamente; nenhum grant novo e necessario.
alter table public.pedidos add column if not exists chave_idempotencia uuid;

create unique index pedidos_idempotencia
  on public.pedidos (loja_id, chave_idempotencia) where chave_idempotencia is not null;
