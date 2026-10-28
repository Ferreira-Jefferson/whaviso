-- Rede de seguranca da baixa de insumo por venda: no maximo UM lancamento 'consumo' por
-- (pedido, insumo), espelhando movimentos_item_venda_idempotente (0023) do lado do item.
--
-- O trigger pedido_baixar_estoque (0055) e a funcao de referencia darBaixaPorVenda ja fazem a
-- idempotencia por um `not exists (... tipo='consumo')` antes de inserir. Sob READ COMMITTED esse
-- `not exists` NAO barra dois inserts concorrentes do mesmo (pedido, insumo): o indice unico
-- parcial fecha essa janela no banco (um dos inserts falha com unique em vez de duplicar a baixa),
-- do mesmo jeito que o lado do item ja fechava.
create unique index movimentos_insumo_consumo_idempotente
  on public.movimentos_insumo (pedido_id, insumo_id)
  where tipo = 'consumo' and pedido_id is not null;
