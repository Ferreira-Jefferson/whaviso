-- Estoque por item do cardapio.
--
-- Dois niveis de disponibilidade convivem sem se sobrepor:
--   * cardapio: itens.ativo + itens.esgotado_ate (liga/desliga manual, "esgotado hoje").
--   * estoque:  itens.controla_estoque + itens.quantidade_disponivel (CONTAGEM, inteiro).
--
-- controla_estoque = false                                 -> item sem contagem (default; atual).
-- controla_estoque = true  e quantidade_disponivel = NULL  -> contagem ilimitada.
-- controla_estoque = true  e quantidade_disponivel >= 0    -> contagem efetiva (nunca negativa).
--
-- Toda mudanca de contagem vira um lancamento em movimentos_item_estoque (append-only, auditoria),
-- com a quantidade resultante no instante. A VENDA decrementa pelo fluxo do atendente (por isso o
-- UPDATE da coluna de contagem e o INSERT no movimento sao concedidos tambem a whaviso_atendente).
-- Estoque e contagem, nunca dinheiro: nada de centavos aqui.

alter table public.itens
  add column controla_estoque boolean not null default false,
  add column quantidade_disponivel integer;

alter table public.itens
  add constraint itens_quantidade_nao_negativa
    check (quantidade_disponivel is null or quantidade_disponivel >= 0),
  add constraint itens_quantidade_exige_controle
    check (quantidade_disponivel is null or controla_estoque);

-- Lancamentos de estoque por item. Append-only: so INSERT, nunca UPDATE/DELETE (auditoria).
create table public.movimentos_item_estoque (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  item_id uuid not null references public.itens (id) on delete cascade,
  tipo text not null,
  quantidade integer not null,              -- modulo do lancamento (entrada/saida/venda) ou alvo (ajuste)
  quantidade_resultante integer not null,   -- contagem do item apos o lancamento
  motivo text,
  pedido_id uuid references public.pedidos (id),  -- preenchido so na venda
  criado_por_user_id uuid,
  criado_em timestamptz not null default now(),
  constraint movimentos_item_tipo_valido
    check (tipo in ('entrada', 'saida', 'ajuste', 'venda')),
  constraint movimentos_item_quantidade_nao_negativa check (quantidade >= 0),
  constraint movimentos_item_resultante_nao_negativa check (quantidade_resultante >= 0)
);
create index movimentos_item_estoque_item on public.movimentos_item_estoque (item_id, criado_em);
create index movimentos_item_estoque_loja on public.movimentos_item_estoque (loja_id, criado_em);
create index movimentos_item_estoque_pedido on public.movimentos_item_estoque (pedido_id)
  where pedido_id is not null;
-- Idempotencia da venda: no maximo um lancamento 'venda' por (pedido, item).
create unique index movimentos_item_venda_idempotente
  on public.movimentos_item_estoque (pedido_id, item_id)
  where tipo = 'venda' and pedido_id is not null;

alter table public.movimentos_item_estoque enable row level security;

-- Grants. api: dona do painel de estoque (le/lanca). atendente: decrementa na venda (insere
-- o movimento e atualiza a contagem do item); le para a idempotencia. Sem UPDATE/DELETE no
-- movimento (append-only) para ninguem.
grant select, insert on public.movimentos_item_estoque to whaviso_api;
grant select, insert on public.movimentos_item_estoque to whaviso_atendente;
grant update (quantidade_disponivel) on public.itens to whaviso_atendente;

create trigger trg_movimentos_item_estoque_append_only before update on public.movimentos_item_estoque
  for each row execute function public.rejeitar_update_append_only();

create policy api_movimentos_item_estoque on public.movimentos_item_estoque
  for all to whaviso_api using (true) with check (true);
create policy atendente_movimentos_item_estoque_sel on public.movimentos_item_estoque
  for select to whaviso_atendente using (true);
create policy atendente_movimentos_item_estoque_ins on public.movimentos_item_estoque
  for insert to whaviso_atendente with check (true);
-- A venda escreve so a contagem do item; a policy de UPDATE libera a linha, o grant por coluna
-- restringe o que pode mudar (quantidade_disponivel apenas).
create policy atendente_itens_estoque_update on public.itens
  for update to whaviso_atendente using (true) with check (true);
