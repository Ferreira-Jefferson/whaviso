-- Ficha tecnica (receita): liga um item do cardapio aos insumos que ele consome, para dar
-- baixa no estoque de insumos quando o item e vendido. `quantidade` = consumo por UMA unidade
-- vendida do item (numeric com 3 casas; ex.: 0.250 kg de farinha por pizza).
--
-- Depende da 0004 (itens) e da 0026 (insumos, movimentos_insumo): as FKs de insumo exigem que a
-- 0026 ja tenha criado public.insumos. Esta migration SO cria fichas_tecnicas; nunca cria nem
-- altera insumos/movimentos_insumo (feature-first: outro modulo e dono dessas tabelas).
--
-- Remocao de um insumo da ficha: sem DELETE (padrao de negocio append/estado). Uma linha some da
-- ficha virando `ativo = false` (reconfiguracao por estado, como enderecos.ativo e itens_pedido.
-- cancelado); readicionar o mesmo insumo reativa a linha (unicidade por item_id, insumo_id).

create table public.fichas_tecnicas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  item_id uuid not null references public.itens (id),
  insumo_id uuid not null references public.insumos (id),
  quantidade numeric(14,3) not null,                 -- consumo por 1 unidade vendida do item
  ativo boolean not null default true,               -- remocao logica (nao ha DELETE)
  criado_em timestamptz not null default now(),
  constraint fichas_tecnicas_quantidade_positiva check (quantidade > 0),
  constraint fichas_tecnicas_item_insumo_unico unique (item_id, insumo_id)
);
create index fichas_tecnicas_loja on public.fichas_tecnicas (loja_id);
create index fichas_tecnicas_item on public.fichas_tecnicas (item_id);

alter table public.fichas_tecnicas enable row level security;

-- api: dona da ficha (painel, estrutura do cardapio). atendente: SO le, pois precisa da ficha
-- para dar baixa no estoque no momento da venda. Sem DELETE para nenhum role (SEC-030).
grant select, insert, update on public.fichas_tecnicas to whaviso_api;
grant select on public.fichas_tecnicas to whaviso_atendente;

create policy api_fichas_tecnicas on public.fichas_tecnicas
  for all to whaviso_api using (true) with check (true);
create policy atendente_fichas_tecnicas on public.fichas_tecnicas
  for select to whaviso_atendente using (true);
