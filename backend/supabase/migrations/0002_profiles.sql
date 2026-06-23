-- Perfil do usuário, 1:1 com auth.users. Dono: módulo `perfil` da api.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  telefone text,
  role role_usuario not null default 'cobrador',
  pix_padrao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint profiles_telefone_e164 check (telefone is null or telefone ~ '^\+[1-9][0-9]{9,14}$'),
  constraint profiles_nome_tam check (char_length(nome) <= 120),
  constraint profiles_pix_tam check (pix_padrao is null or char_length(pix_padrao) <= 140)
);

-- Mantém atualizado_em coerente em qualquer UPDATE.
create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger trg_profiles_atualizado_em
  before update on public.profiles
  for each row execute function public.tocar_atualizado_em();

-- Cria o profile automaticamente no signup (security definer: roda como dono da função).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_auth_user_criado
  after insert on auth.users
  for each row execute function public.handle_new_user();
