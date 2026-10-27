-- Caixa (PDV): sessao de caixa e seus movimentos. O dono/gerente opera o caixa fisicamente no
-- balcao enquanto o atendente de WhatsApp roda em paralelo; e um sistema so. Dinheiro em centavos.
--
-- Modelo:
--   caixas            = sessao (abre com saldo inicial, fecha com conferencia). No maximo UMA
--                       sessao 'aberto' por loja ao mesmo tempo (indice parcial unico).
--   movimentos_caixa  = lancamentos da sessao (append-only: sem UPDATE/DELETE). venda, sangria,
--                       suprimento e ajuste. forma_pagamento so faz sentido na venda.
--
-- Saldo esperado em dinheiro na hora de fechar:
--   saldo_inicial + suprimentos + vendas_em_dinheiro - sangrias   (ajuste nao entra nesta conta)

create table public.caixas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  aberto_por_user_id uuid not null,
  aberto_em timestamptz not null default now(),
  saldo_inicial_centavos integer not null default 0,
  status text not null default 'aberto' check (status in ('aberto', 'fechado')),
  fechado_por_user_id uuid,
  fechado_em timestamptz,
  saldo_informado_centavos integer,
  saldo_calculado_centavos integer,
  diferenca_centavos integer,
  observacoes text,
  constraint caixas_saldo_inicial_nao_negativo check (saldo_inicial_centavos >= 0),
  constraint caixas_fechado_coerente
    check (status = 'aberto'
           or (fechado_por_user_id is not null and fechado_em is not null
               and saldo_informado_centavos is not null and saldo_calculado_centavos is not null
               and diferenca_centavos is not null))
);
-- No maximo UMA sessao aberta por loja ao mesmo tempo.
create unique index caixas_uma_aberta_por_loja on public.caixas (loja_id) where status = 'aberto';
create index caixas_loja on public.caixas (loja_id, aberto_em desc);

create table public.movimentos_caixa (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  caixa_id uuid not null references public.caixas (id),
  tipo text not null check (tipo in ('venda', 'sangria', 'suprimento', 'ajuste')),
  forma_pagamento text check (forma_pagamento in ('dinheiro', 'credito', 'debito', 'pix', 'outro')),
  valor_centavos integer not null,
  pedido_id uuid references public.pedidos (id),
  motivo text,
  criado_por_user_id uuid not null,
  criado_em timestamptz not null default now(),
  -- Venda exige forma de pagamento; os demais tipos nao tem forma (dinheiro do caixa / anotacao).
  constraint movimentos_caixa_forma_coerente
    check ((tipo = 'venda' and forma_pagamento is not null)
           or (tipo <> 'venda' and forma_pagamento is null))
);
create index movimentos_caixa_caixa on public.movimentos_caixa (caixa_id, criado_em);
create index movimentos_caixa_loja on public.movimentos_caixa (loja_id);
create index movimentos_caixa_pedido on public.movimentos_caixa (pedido_id) where pedido_id is not null;

-- RLS deny-all (anon/authenticated ja perderam tudo na 0001). A api e a unica porta de dados.
alter table public.caixas            enable row level security;
alter table public.movimentos_caixa  enable row level security;

-- api: dona do caixa. Caixa muda de estado (abre/fecha) => UPDATE em caixas. Movimento e
-- append-only => so SELECT/INSERT (sem UPDATE/DELETE: lancamento nunca some nem se reescreve).
grant select, insert, update on public.caixas           to whaviso_api;
grant select, insert         on public.movimentos_caixa to whaviso_api;

create policy api_caixas           on public.caixas           for all to whaviso_api using (true) with check (true);
create policy api_movimentos_caixa on public.movimentos_caixa for all to whaviso_api using (true) with check (true);
