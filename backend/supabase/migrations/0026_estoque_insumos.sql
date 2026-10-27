-- Estoque de insumos (materia-prima do restaurante: arroz, feijao, carne, oleo...).
-- DISTINTO do estoque por item do cardapio (itens.esgotado_ate / saldo por item): aqui e o
-- insumo bruto que a ficha tecnica (0027) consome por venda.
--
--   insumos            cadastro + saldo atual (quantidade_atual) e minimo de alerta
--                      (quantidade_minima). Custo unitario em centavos (integer, opcional).
--   movimentos_insumo  append-only: TODA mudanca de saldo gera uma linha
--                      (entrada | saida | ajuste | consumo), guardando quantidade_resultante
--                      (o saldo APOS o movimento). O saldo nao e derivado da soma: ele vive em
--                      insumos.quantidade_atual e o movimento e a trilha de auditoria imutavel.
--
-- Quantidades em numeric(14,3) (kg/g/l/ml/un). Dinheiro em centavos (integer). Saldo nunca
-- negativo (guarda na aplicacao + check na tabela). Multi-tenant por loja_id em tudo.

create table public.insumos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  nome text not null,
  unidade text not null,                              -- ex. 'kg','g','l','ml','un'
  quantidade_atual numeric(14,3) not null default 0,
  quantidade_minima numeric(14,3) not null default 0,
  custo_unitario_centavos integer,                    -- NULL = nao informado
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint insumos_quantidade_atual_nao_negativa check (quantidade_atual >= 0),
  constraint insumos_quantidade_minima_nao_negativa check (quantidade_minima >= 0),
  constraint insumos_custo_nao_negativo check (custo_unitario_centavos is null or custo_unitario_centavos >= 0)
);
create index insumos_loja on public.insumos (loja_id) where ativo;

create table public.movimentos_insumo (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  insumo_id uuid not null references public.insumos (id),
  tipo text not null,
  quantidade numeric(14,3) not null,                  -- magnitude do movimento (ou saldo contado no ajuste)
  quantidade_resultante numeric(14,3) not null,       -- saldo do insumo apos o movimento
  motivo text,
  pedido_id uuid,
  criado_por_user_id uuid,
  criado_em timestamptz not null default now(),
  constraint movimentos_insumo_tipo_valido check (tipo in ('entrada', 'saida', 'ajuste', 'consumo')),
  constraint movimentos_insumo_quantidade_nao_negativa check (quantidade >= 0),
  constraint movimentos_insumo_resultante_nao_negativa check (quantidade_resultante >= 0)
);
create index movimentos_insumo_insumo on public.movimentos_insumo (insumo_id, criado_em desc);
create index movimentos_insumo_loja on public.movimentos_insumo (loja_id, criado_em desc);

create trigger trg_insumos_atualizado_em before update on public.insumos
  for each row execute function public.tocar_atualizado_em();

-- Auditoria imutavel: UPDATE barrado por trigger (mesmo para o dono), DELETE por falta de grant.
create trigger trg_movimentos_insumo_imutavel before update on public.movimentos_insumo
  for each row execute function public.rejeitar_update_append_only();

-- RLS deny-all: anon/authenticated nao recebem nada (REVOKE + default privileges da 0001). So os
-- roles de servico passam, com policies using(true) limitadas pelo teto real do GRANT.
alter table public.insumos           enable row level security;
alter table public.movimentos_insumo enable row level security;

-- api: dona do cadastro de insumos (painel). Movimento e append-only (select, insert; sem update/delete).
grant select, insert, update on public.insumos to whaviso_api;
grant select, insert on public.movimentos_insumo to whaviso_api;

-- atendente: o consumo por venda (via ficha tecnica 0027) roda no fluxo do atendente. Ele LE o
-- saldo do insumo, decrementa so a coluna quantidade_atual (nunca negativo) e enfileira a linha
-- de movimento 'consumo'. Nada mais (sem editar nome/preco/minimo do cadastro).
grant select on public.insumos to whaviso_atendente;
grant update (quantidade_atual) on public.insumos to whaviso_atendente;
grant insert on public.movimentos_insumo to whaviso_atendente;

create policy api_insumos           on public.insumos           for all to whaviso_api using (true) with check (true);
create policy api_movimentos_insumo on public.movimentos_insumo for all to whaviso_api using (true) with check (true);

create policy atendente_insumos_select on public.insumos for select to whaviso_atendente using (true);
create policy atendente_insumos_update on public.insumos for update to whaviso_atendente using (true) with check (true);
create policy atendente_movimentos_insumo_insert on public.movimentos_insumo for insert to whaviso_atendente with check (true);
