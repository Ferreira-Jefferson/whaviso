-- Shim mínimo do ambiente Supabase para validar migrations num Postgres puro.
-- NÃO faz parte das migrations; usado só pelo script de validação local.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- Tabela de identidades por provedor (Google, phone, etc.). Usada pelas funções
-- SECURITY DEFINER da migration 0064 para detectar o tipo de conta.
create table if not exists auth.identities (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  identity_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (provider, id)
);

-- Roles que o Supabase já provê; aqui criamos para o GRANT/RLS não falhar.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end
$$;
