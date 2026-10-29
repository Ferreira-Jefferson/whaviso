-- Chave de API por conta cliente, emitida pela Whaviso (console da plataforma). A chave autoriza
-- SOMENTE a conta dona (SEC-001/002); o escopo de loja continua vindo do header x-loja-id.
-- Persiste so o hash sha256 do segredo (nunca o valor claro) + prefixo e ultimos4 para exibicao
-- mascarada. Sem DELETE (SEC-030): revogar = revogada_em. expira_em NULL = sem validade.

create table public.chaves_api (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.contas (id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 80),
  prefixo text not null,
  ultimos4 text not null check (length(ultimos4) = 4),
  hash_sha256 text not null check (hash_sha256 ~ '^[0-9a-f]{64}$'),
  criado_em timestamptz not null default now(),
  expira_em timestamptz,
  revogada_em timestamptz,
  constraint chaves_api_hash_unico unique (hash_sha256)
);
create index chaves_api_conta on public.chaves_api (conta_id, criado_em desc);

alter table public.chaves_api enable row level security;

-- api: emite, lista, resolve por hash e revoga (update). Sem DELETE (RLS deny-all p/ anon/authenticated).
grant select, insert, update on public.chaves_api to whaviso_api;

create policy api_chaves_api on public.chaves_api for all to whaviso_api using (true) with check (true);
