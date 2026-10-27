-- Pedidos (kanban): pedidos, itens_pedido e itens_pedido_opcoes.
--
-- Nome e preço de cada item/opção são SNAPSHOT do momento do pedido: mudar o cardápio depois
-- nunca reescreve pedido antigo. Dinheiro em centavos.
--
-- Ordem de criação: pedidos referencia tabelas criadas nas migrations 0006 (clientes,
-- conversas, enderecos) e 0007 (zonas_entrega, corridas, motoboys). As colunas nascem aqui e as
-- FKs são adicionadas por ALTER TABLE nessas migrations, para manter a divisão temática.

create type status_pedido as enum (
  'rascunho',        -- montado pelo atendente (IA), ainda não confirmado; fora do kanban
  'novo', 'em_preparo', 'saiu_entrega', 'entregue', 'problema'
);
create type origem_pedido as enum ('whatsapp', 'ifood', 'manual');
create type modalidade_pedido as enum ('entrega', 'retirada');

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  cliente_id uuid,                                   -- FK em 0006
  conversa_id uuid,                                  -- FK em 0006
  numero_whatsapp_id uuid references public.numeros_whatsapp (id),
  codigo text not null,                              -- código curto exibido, único por loja
  status status_pedido not null default 'novo',
  origem origem_pedido not null default 'whatsapp',
  modalidade modalidade_pedido not null default 'entrega',
  subtotal_centavos integer not null,
  taxa_entrega_centavos integer not null default 0,
  total_centavos integer not null,
  zona_id uuid,                                      -- FK em 0007 (precifica a entrega)
  corrida_id uuid,                                   -- FK em 0007 (lote de despacho)
  ordem_parada smallint,                             -- posição do pedido dentro da corrida
  motoboy_id uuid,                                   -- FK em 0007
  motoboy_nome text,                                 -- nome registrado p/ responsabilização
  endereco_id uuid,                                  -- FK em 0006
  observacao text,
  problema_motivo text,
  entregue_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint pedidos_valores_nao_negativos
    check (subtotal_centavos >= 0 and taxa_entrega_centavos >= 0 and total_centavos >= 0),
  constraint pedidos_total_confere check (total_centavos = subtotal_centavos + taxa_entrega_centavos),
  constraint pedidos_problema_tem_motivo check (status <> 'problema' or problema_motivo is not null)
);
create unique index pedidos_codigo_loja on public.pedidos (loja_id, codigo);
create index pedidos_kanban on public.pedidos (loja_id, status, criado_em);
create index pedidos_cliente on public.pedidos (cliente_id) where cliente_id is not null;
create index pedidos_conversa on public.pedidos (conversa_id) where conversa_id is not null;
create index pedidos_corrida on public.pedidos (corrida_id) where corrida_id is not null;
create index pedidos_motoboy on public.pedidos (motoboy_id, criado_em) where motoboy_id is not null;

create table public.itens_pedido (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  loja_id uuid not null references public.lojas (id) on delete cascade,
  item_id uuid references public.itens (id),         -- referência de origem; o snapshot manda
  nome_snapshot text not null,
  preco_unitario_centavos integer not null,
  quantidade smallint not null default 1,
  total_centavos integer not null,                    -- (preço unitário + opções) * quantidade
  observacao text,
  cancelado boolean not null default false,           -- remoção lógica de linha (não há DELETE)
  criado_em timestamptz not null default now(),
  constraint itens_pedido_valores check (preco_unitario_centavos >= 0 and quantidade > 0 and total_centavos >= 0)
);
create index itens_pedido_pedido on public.itens_pedido (pedido_id);
create index itens_pedido_loja on public.itens_pedido (loja_id);
create index itens_pedido_item on public.itens_pedido (item_id) where item_id is not null;

create table public.itens_pedido_opcoes (
  id uuid primary key default gen_random_uuid(),
  item_pedido_id uuid not null references public.itens_pedido (id) on delete cascade,
  loja_id uuid not null references public.lojas (id) on delete cascade,
  opcao_id uuid references public.opcoes (id),        -- referência de origem; o snapshot manda
  grupo_nome_snapshot text not null,
  nome_snapshot text not null,
  preco_centavos integer not null default 0,
  quantidade smallint not null default 1,
  criado_em timestamptz not null default now(),
  constraint itens_pedido_opcoes_valores check (preco_centavos >= 0 and quantidade > 0)
);
create index itens_pedido_opcoes_item on public.itens_pedido_opcoes (item_pedido_id);
create index itens_pedido_opcoes_loja on public.itens_pedido_opcoes (loja_id);

create trigger trg_pedidos_atualizado_em before update on public.pedidos
  for each row execute function public.tocar_atualizado_em();

-- RLS + grants. api: dona do kanban. atendente: cria e ajusta o rascunho (sem DELETE: linha
-- removida vira cancelado = true).
alter table public.pedidos             enable row level security;
alter table public.itens_pedido        enable row level security;
alter table public.itens_pedido_opcoes enable row level security;

grant select, insert, update on public.pedidos, public.itens_pedido, public.itens_pedido_opcoes to whaviso_api;
grant select, insert, update on public.pedidos, public.itens_pedido, public.itens_pedido_opcoes to whaviso_atendente;

create policy api_pedidos             on public.pedidos             for all to whaviso_api using (true) with check (true);
create policy api_itens_pedido        on public.itens_pedido        for all to whaviso_api using (true) with check (true);
create policy api_itens_pedido_opcoes on public.itens_pedido_opcoes for all to whaviso_api using (true) with check (true);

-- O atendente só mexe em pedido enquanto é rascunho e só pode confirmá-lo (rascunho -> novo);
-- depois disso o kanban é da api.
create policy atendente_pedidos_select on public.pedidos for select to whaviso_atendente using (true);
create policy atendente_pedidos_insert on public.pedidos for insert to whaviso_atendente
  with check (status in ('rascunho', 'novo'));
create policy atendente_pedidos_update on public.pedidos for update to whaviso_atendente
  using (status = 'rascunho') with check (status in ('rascunho', 'novo'));
create policy atendente_itens_pedido        on public.itens_pedido        for all to whaviso_atendente using (true) with check (true);
create policy atendente_itens_pedido_opcoes on public.itens_pedido_opcoes for all to whaviso_atendente using (true) with check (true);
