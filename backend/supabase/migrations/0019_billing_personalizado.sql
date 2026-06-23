-- Fase 2 do billing: plano personalizado (preço por fórmula) + estrutura de
-- faturamento agnóstica de gateway. Objetivos:
--   1. o plano do usuário fica gravado, inclusive a QUANTIDADE escolhida no
--      personalizado e o preço mensal CONGELADO na contratação (snapshot);
--   2. há onde registrar faturas e eventos do provedor de pagamento, sem
--      acoplar a um provedor específico (Mercado Pago/Stripe/etc entram depois
--      atrás do adaptador na api).
-- Dinheiro em centavos (regra de ouro). Sem DELETE em nada (auditoria financeira
-- append-only, padrão da 0008).

-- 1. planos: marca os que têm preço por fórmula (preco_centavos fixo não vale).
alter table public.planos add column parametrico boolean not null default false;

-- Catálogo de planos como UPSERT idempotente (fonte única; saiu do seed, que era
-- dev-only e não chegava ao cloud/prod). `db push` aplica isto em qualquer
-- ambiente; corrige linhas antigas e insere o personalizado. Dinheiro em centavos.
--   pessoal:       10 whavisos, sem reenvio
--   profissional:  15 whavisos, com reenvio
--   personalizado: preço por fórmula (preco_centavos/limite reais vêm da assinatura)
insert into public.planos (id, nome, preco_centavos, max_avisos_ativos, permite_recorrente, parametrico) values
  ('pessoal', 'whaviso pessoal', 990, 10, false, false),
  ('profissional', 'whaviso profissional', 1490, 15, true, false),
  ('personalizado', 'whaviso personalizado', 0, null, true, true)
on conflict (id) do update set
  nome = excluded.nome,
  preco_centavos = excluded.preco_centavos,
  max_avisos_ativos = excluded.max_avisos_ativos,
  permite_recorrente = excluded.permite_recorrente,
  parametrico = excluded.parametrico;

-- 2. assinaturas: quantidade contratada (só personalizado) + preço mensal
--    congelado no momento da contratação (não recalcula sozinho se a fórmula
--    mudar). A coerência plano<->quantidade é garantida na api ao assinar.
alter table public.assinaturas add column quantidade integer;
alter table public.assinaturas add column preco_centavos integer;
alter table public.assinaturas
  add constraint assinaturas_quantidade_minima check (quantidade is null or quantidade >= 16);
alter table public.assinaturas
  add constraint assinaturas_preco_nao_negativo check (preco_centavos is null or preco_centavos >= 0);

-- 3. Faturas do gateway (agnóstico de provedor). Estado transiciona
--    (pendente -> pago/falhou/estornado/cancelado); a api é a dona.
create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  plano_id text not null references public.planos (id),
  quantidade integer,
  valor_centavos integer not null,
  status text not null default 'pendente',
  -- Costura do gateway: nome do provedor e id da fatura no provedor.
  provedor text,
  provedor_ref text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint pagamentos_status_valido
    check (status in ('pendente', 'pago', 'falhou', 'estornado', 'cancelado')),
  constraint pagamentos_valor_nao_negativo check (valor_centavos >= 0)
);
create index idx_pagamentos_profile on public.pagamentos (profile_id, criado_em desc);
-- Idempotência do webhook: uma fatura por (provedor, ref).
create unique index idx_pagamentos_provedor_ref on public.pagamentos (provedor, provedor_ref)
  where provedor_ref is not null;

create trigger trg_pagamentos_atualizado_em
  before update on public.pagamentos
  for each row execute function public.tocar_atualizado_em();

-- 4. Eventos de faturamento (log bruto do webhook do provedor). Append-only.
create table public.eventos_pagamento (
  id uuid primary key default gen_random_uuid(),
  pagamento_id uuid references public.pagamentos (id) on delete cascade,
  tipo text not null,
  provedor text,
  provedor_ref text,
  -- payload do provedor para conferência/auditoria (sem dado sensível em log).
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index idx_eventos_pagamento_pag on public.eventos_pagamento (pagamento_id, criado_em);

-- 5. Grants (padrão 0008: sem DELETE). eventos_pagamento é append-only -> só
--    select+insert, como eventos_aviso. assinaturas/planos já têm grant na 0008.
grant select, insert, update on public.pagamentos to whaviso_api;
grant select, insert on public.eventos_pagamento to whaviso_api;

-- 6. RLS deny-all para anon/authenticated; policies só para a api.
alter table public.pagamentos        enable row level security;
alter table public.eventos_pagamento enable row level security;
create policy api_pagamentos on public.pagamentos for all to whaviso_api using (true) with check (true);
create policy api_eventos_pagamento on public.eventos_pagamento for all to whaviso_api using (true) with check (true);
