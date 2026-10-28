-- Idempotencia do ajuste manual de motoboy: fecha a janela de duplo-clique/retry no
-- `lancamentoManual`. motoboy_lancamentos so tinha dedup para tipo='entrega' (lancamentos_entrega_unica,
-- por pedido_id); o 'ajuste' (valor com sinal, pagamento do motoboy) nao tinha chave, entao reenviar
-- o mesmo ajuste duplicava a linha e superfaturava o fechamento do dia. A chave vem do cliente (uma
-- por acao); quando presente, o reenvio com a mesma chave e no-op. Espelha eventos_custo (0047).
alter table public.motoboy_lancamentos add column chave_idempotencia text;

alter table public.motoboy_lancamentos
  add constraint motoboy_lancamentos_chave_formato
  check (chave_idempotencia is null or chave_idempotencia ~ '^[A-Za-z0-9_.:-]{1,120}$');

create unique index motoboy_lancamentos_idempotencia
  on public.motoboy_lancamentos (loja_id, chave_idempotencia) where chave_idempotencia is not null;
