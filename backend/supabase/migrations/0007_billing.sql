-- Planos e assinaturas. Dono: módulo `billing` da api. MVP sem gateway (stub trial).

create table public.planos (
  id text primary key, -- 'pessoal' | 'profissional'
  nome text not null,
  preco_centavos integer not null,
  max_avisos_ativos integer, -- null = ilimitado
  permite_recorrente boolean not null default false,
  constraint planos_preco_nao_negativo check (preco_centavos >= 0)
);

create table public.assinaturas (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  plano_id text not null references public.planos (id),
  status text not null default 'trial', -- 'ativa' | 'cancelada' | 'trial'
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint assinaturas_status_valido check (status in ('ativa', 'cancelada', 'trial'))
);

create trigger trg_assinaturas_atualizado_em
  before update on public.assinaturas
  for each row execute function public.tocar_atualizado_em();
