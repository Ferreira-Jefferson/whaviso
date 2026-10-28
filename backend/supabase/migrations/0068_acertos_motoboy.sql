-- Acerto do motoboy POR PERIODO (dia/semana/mes que o usuario escolhe), no modulo contas a pagar.
-- Generaliza o fechamento diario (tabela `fechamentos`, que vive so ate o modulo motoboys ser
-- dissolvido): aqui o acerto cobre um intervalo [periodo_inicio, periodo_fim] INCLUSIVO.
--
-- O ledger `motoboy_lancamentos` (entregas automaticas + ajustes manuais) continua sendo a fonte;
-- o total e DERIVADO do regime (colunas em `motoboys`) + ledger, e so e CONGELADO em
-- `total_pago_centavos` no momento do pagamento (para o pago nao mudar se um lancamento mudar
-- depois). Uma linha aqui so existe quando o periodo e PAGO (ver o acerto em aberto e calculo puro,
-- sem linha). Anti dupla contagem: dois acertos PAGOS do mesmo motoboy nao podem sobrepor periodo
-- (checado no service sob advisory lock do motoboy; sem exclusion constraint para nao exigir
-- btree_gist). Sem DELETE. Reusa o enum status_fechamento (aberto|pago).

create table public.acertos_motoboy (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  motoboy_id uuid not null references public.motoboys (id),
  periodo_inicio date not null,                 -- dia de negocio (America/Sao_Paulo), inclusivo
  periodo_fim date not null,                    -- idem, inclusivo
  status status_fechamento not null default 'pago',
  total_pago_centavos integer,                  -- snapshot do total no pagamento
  pago_em timestamptz,
  pago_por_user_id uuid references auth.users (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint acertos_periodo_ordenado check (periodo_fim >= periodo_inicio),
  constraint acertos_pago_coerente check (
    status <> 'pago' or (pago_em is not null and total_pago_centavos is not null)
  )
);
create index acertos_motoboy_periodo on public.acertos_motoboy (motoboy_id, periodo_inicio, periodo_fim);
create index acertos_loja_status on public.acertos_motoboy (loja_id, status);

create trigger trg_acertos_motoboy_atualizado_em before update on public.acertos_motoboy
  for each row execute function public.tocar_atualizado_em();

alter table public.acertos_motoboy enable row level security;

-- api: dona (painel de financeiro). Sem DELETE (RLS deny-all p/ anon/authenticated).
grant select, insert, update on public.acertos_motoboy to whaviso_api;

create policy api_acertos_motoboy on public.acertos_motoboy for all to whaviso_api using (true) with check (true);
