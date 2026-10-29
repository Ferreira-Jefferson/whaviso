-- FK de movimentos_insumo.pedido_id -> pedidos.id (hardening da trilha de auditoria).
--
-- O ledger de insumo (0026) nasceu com pedido_id uuid SOLTO, sem FK, enquanto o ledger gemeo
-- movimentos_item_estoque (0023:35) sempre teve `references public.pedidos (id)`. Sem FK, um
-- pedido_id inexistente ou de outra loja pode poluir a trilha append-only e a idempotencia da
-- baixa por venda (o indice unico parcial de 0063 chaveia justamente em pedido_id). Esta migration
-- fecha essa assimetria: passa a exigir que todo pedido_id preenchido aponte para um pedido real.
--
-- pedido_id continua NULL-avel (entrada/saida/ajuste manual nao tem pedido); a FK so vale quando
-- preenchido. Indice em pedido_id espelha movimentos_item_estoque_pedido (0023:45) e sustenta a
-- validacao e as buscas por pedido. A constraint entra `not valid` (nao trava o insert do catalogo
-- existente no momento do add) e e validada em seguida num passo separado.
create index if not exists movimentos_insumo_pedido
  on public.movimentos_insumo (pedido_id) where pedido_id is not null;
alter table public.movimentos_insumo
  add constraint movimentos_insumo_pedido_fk
  foreign key (pedido_id) references public.pedidos (id) not valid;
alter table public.movimentos_insumo validate constraint movimentos_insumo_pedido_fk;
