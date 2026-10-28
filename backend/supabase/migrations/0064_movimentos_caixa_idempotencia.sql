-- Idempotencia do lancamento de caixa (PDV): fecha a janela de duplo-clique/retry no `registrar`.
-- movimentos_caixa e append-only e nao tinha chave de dedup: reenviar a mesma venda/sangria/
-- suprimento/ajuste (timeout + retry do cliente, ou duplo-clique) inseria outra linha e inflava o
-- saldo_calculado no fechamento. A chave vem do cliente (uma por acao do operador); quando presente,
-- o reenvio com a mesma chave e no-op (devolve o mesmo movimento). Espelha eventos_custo (0047).
alter table public.movimentos_caixa add column chave_idempotencia text;

alter table public.movimentos_caixa
  add constraint movimentos_caixa_chave_formato
  check (chave_idempotencia is null or chave_idempotencia ~ '^[A-Za-z0-9_.:-]{1,120}$');

create unique index movimentos_caixa_idempotencia
  on public.movimentos_caixa (loja_id, chave_idempotencia) where chave_idempotencia is not null;
