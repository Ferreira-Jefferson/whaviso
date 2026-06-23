-- Chaves Pix do usuário: N por perfil, 1 marcada como padrão. Dono: módulo `perfil`.
-- O Pix deixa de ser uma coluna única em profiles (pix_padrao) e passa a ser uma
-- coleção gerenciável na Conta, oferecida como opções no cadastro de um aviso.
-- "Remover" uma chave é soft-delete (arquivada=true): nenhum role tem DELETE.

create table public.chaves_pix (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  chave text not null,
  rotulo text,
  padrao boolean not null default false,
  arquivada boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint chaves_pix_chave_tam check (char_length(chave) <= 140),
  constraint chaves_pix_rotulo_tam check (rotulo is null or char_length(rotulo) <= 60)
);

-- no máx. 1 chave ativa idêntica por usuário; no máx. 1 padrão ativa por usuário.
create unique index chaves_pix_unq    on public.chaves_pix (profile_id, chave) where not arquivada;
create unique index chaves_pix_padrao on public.chaves_pix (profile_id)        where padrao and not arquivada;
create index        chaves_pix_ativas on public.chaves_pix (profile_id)        where not arquivada;

-- Reusa a função de 0002_profiles.sql para manter atualizado_em coerente.
create trigger trg_chaves_pix_atualizado_em
  before update on public.chaves_pix
  for each row execute function public.tocar_atualizado_em();

-- Backfill: cada pix_padrao não-vazio vira a chave padrão do usuário.
insert into public.chaves_pix (profile_id, chave, padrao)
select id, pix_padrao, true
from public.profiles
where pix_padrao is not null and pix_padrao <> '';

-- Fonte única da verdade passa a ser chaves_pix: remove a coluna antiga e seu check.
alter table public.profiles drop constraint if exists profiles_pix_tam;
alter table public.profiles drop column pix_padrao;

-- Grants + RLS no padrão da 0008 (só a api precisa; sem DELETE; zap não acessa).
grant select, insert, update on public.chaves_pix to whaviso_api;
alter table public.chaves_pix enable row level security;
create policy api_chaves_pix on public.chaves_pix for all to whaviso_api using (true) with check (true);
