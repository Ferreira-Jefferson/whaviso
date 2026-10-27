-- Núcleo multi-tenant: Conta -> Lojas -> Membros.
-- Toda tabela de loja carrega loja_id; as da conta, conta_id. O escopo por loja é imposto pelo
-- kernel de tenant da api (WHERE loja_id = ANY(lojas_do_usuario)); o RLS segue deny-all para
-- anon/authenticated. Sem DELETE: tabelas de negócio mudam de estado, nunca somem.

create type papel_membro as enum ('dono', 'gerente', 'atendente');

create table public.contas (
  id uuid primary key default gen_random_uuid(),
  dono_user_id uuid not null references auth.users (id) on delete restrict,
  nome text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index contas_dono on public.contas (dono_user_id);

create table public.lojas (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.contas (id) on delete cascade,
  nome text not null,
  logo_url text,
  cores jsonb not null default '{}'::jsonb,   -- branding (painel + cardápio)
  endereco jsonb,
  horarios jsonb,
  area_entrega jsonb,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index lojas_conta on public.lojas (conta_id);

create table public.membros (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.contas (id) on delete cascade,
  loja_id uuid references public.lojas (id) on delete cascade,   -- NULL = todas as lojas da conta
  user_id uuid not null references auth.users (id) on delete cascade,
  papel papel_membro not null,
  ativo boolean not null default true,   -- remoção lógica (não há DELETE)
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
-- NULL não colide em índice único comum: um índice cobre membro de loja específica, o outro
-- cobre o membro "todas as lojas" (um por usuário e conta).
create unique index membros_user_loja on public.membros (user_id, loja_id) where loja_id is not null;
create unique index membros_user_conta_todas on public.membros (user_id, conta_id) where loja_id is null;
create index membros_conta on public.membros (conta_id);
create index membros_loja on public.membros (loja_id) where loja_id is not null;

create trigger trg_contas_atualizado_em before update on public.contas
  for each row execute function public.tocar_atualizado_em();
create trigger trg_lojas_atualizado_em before update on public.lojas
  for each row execute function public.tocar_atualizado_em();
create trigger trg_membros_atualizado_em before update on public.membros
  for each row execute function public.tocar_atualizado_em();

-- RLS + grants. api: dona do cadastro. atendente: só lê a loja (horários, endereço, área).
alter table public.contas  enable row level security;
alter table public.lojas   enable row level security;
alter table public.membros enable row level security;

grant select, insert, update on public.contas, public.lojas, public.membros to whaviso_api;
grant select on public.lojas to whaviso_atendente;

create policy api_contas  on public.contas  for all to whaviso_api using (true) with check (true);
create policy api_lojas   on public.lojas   for all to whaviso_api using (true) with check (true);
create policy api_membros on public.membros for all to whaviso_api using (true) with check (true);
create policy atendente_lojas on public.lojas for select to whaviso_atendente using (true);
