-- Convites de membro (API-conta). O token claro NUNCA persiste: so o sha256 em hex.
-- Sem DELETE: revogar = preencher revogado_em; aceitar = preencher aceito_em (uso unico).
-- RLS deny-all para anon/authenticated; so whaviso_api opera.

create table public.convites (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.contas (id) on delete cascade,
  loja_id uuid references public.lojas (id) on delete cascade,   -- NULL = todas as lojas da conta
  papel papel_membro not null,
  token_hash text not null unique,
  criado_por_membro_id uuid not null references public.membros (id),
  expira_em timestamptz not null,
  aceito_em timestamptz,
  aceito_por_user_id uuid references auth.users (id),
  revogado_em timestamptz,
  criado_em timestamptz not null default now(),
  constraint convites_token_hash_fmt check (token_hash ~ '^[0-9a-f]{64}$')
);
create index convites_conta on public.convites (conta_id);

alter table public.convites enable row level security;

grant select, insert on public.convites to whaviso_api;
-- UPDATE so nas colunas de estado: o resto do convite e imutavel depois de criado.
grant update (aceito_em, aceito_por_user_id, revogado_em) on public.convites to whaviso_api;

create policy api_convites on public.convites for all to whaviso_api using (true) with check (true);
