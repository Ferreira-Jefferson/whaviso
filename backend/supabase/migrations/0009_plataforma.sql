-- Plano da plataforma: a Whaviso opera, o restaurante é o cliente.
--
-- operadores:   equipe Whaviso (distinta de `membros`, que é da loja). O operador enxerga todas as
--               contas, mas só métricas e faturamento, NUNCA conversas nem pedidos das lojas. Esse
--               escopo é imposto pelo kernel da api (por tipo de identidade), não por RLS.
-- prospectos:   restaurantes no funil de aquisição; prospecto_atividades: follow-ups (append-only).
-- assinaturas / faturas: cobrança restaurante -> Whaviso (por conta, opcionalmente por loja).
-- Nenhum destes dados é lido pelo zap nem pelo atendente (sem grant).

create type papel_operador as enum ('operador', 'admin');
create type estagio_prospecto as enum ('novo', 'contato', 'proposta', 'ativo', 'perdido');
create type tipo_atividade_prospecto as enum ('nota', 'ligacao', 'mensagem', 'reuniao', 'follow_up');
create type status_assinatura as enum ('trial', 'ativa', 'suspensa', 'cancelada');
create type status_fatura as enum ('aberta', 'paga', 'atrasada', 'cancelada');

create table public.operadores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nome text not null,
  papel papel_operador not null default 'operador',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index operadores_user on public.operadores (user_id);

create table public.prospectos (
  id uuid primary key default gen_random_uuid(),
  nome_restaurante text not null,
  contato_nome text,
  contato_telefone_hash text,
  contato_telefone_cifrado bytea,
  contato_email text,
  cidade text,
  origem text,
  estagio estagio_prospecto not null default 'novo',
  responsavel_operador_id uuid references public.operadores (id),
  conta_id uuid references public.contas (id),   -- preenchida quando vira cliente (estagio = ativo)
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint prospectos_telefone_hash_fmt
    check (contato_telefone_hash is null or contato_telefone_hash ~ '^[0-9a-f]{64}$')
);
create index prospectos_estagio on public.prospectos (estagio, atualizado_em desc);
create index prospectos_responsavel on public.prospectos (responsavel_operador_id)
  where responsavel_operador_id is not null;

create table public.prospecto_atividades (
  id bigint generated always as identity primary key,
  prospecto_id uuid not null references public.prospectos (id),
  operador_id uuid references public.operadores (id),
  tipo tipo_atividade_prospecto not null,
  descricao text,
  agendada_para timestamptz,                     -- follow-up marcado
  criado_em timestamptz not null default now()
);
create index prospecto_atividades_prospecto on public.prospecto_atividades (prospecto_id, criado_em);
create index prospecto_atividades_agenda on public.prospecto_atividades (agendada_para)
  where agendada_para is not null;

create table public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.contas (id),
  loja_id uuid references public.lojas (id),     -- NULL = assinatura da conta inteira
  status status_assinatura not null default 'trial',
  valor_mensal_centavos integer not null default 70000,
  dia_vencimento smallint not null default 10,
  trial_ate timestamptz,
  inicio_em timestamptz,
  cancelada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint assinaturas_valor check (valor_mensal_centavos >= 0),
  constraint assinaturas_dia check (dia_vencimento between 1 and 28)
);
create index assinaturas_conta on public.assinaturas (conta_id);
create index assinaturas_status on public.assinaturas (status);

create table public.faturas (
  id uuid primary key default gen_random_uuid(),
  assinatura_id uuid not null references public.assinaturas (id),
  conta_id uuid not null references public.contas (id),
  competencia date not null,                     -- primeiro dia do mês de referência
  valor_centavos integer not null,
  vencimento date not null,
  status status_fatura not null default 'aberta',
  pago_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint faturas_valor check (valor_centavos >= 0),
  constraint faturas_pago_tem_data check (status <> 'paga' or pago_em is not null)
);
create unique index faturas_assinatura_competencia on public.faturas (assinatura_id, competencia);
create index faturas_conta on public.faturas (conta_id, vencimento);
create index faturas_status_vencimento on public.faturas (status, vencimento);

create trigger trg_operadores_atualizado_em before update on public.operadores
  for each row execute function public.tocar_atualizado_em();
create trigger trg_prospectos_atualizado_em before update on public.prospectos
  for each row execute function public.tocar_atualizado_em();
create trigger trg_assinaturas_atualizado_em before update on public.assinaturas
  for each row execute function public.tocar_atualizado_em();
create trigger trg_faturas_atualizado_em before update on public.faturas
  for each row execute function public.tocar_atualizado_em();
create trigger trg_prospecto_atividades_imutavel before update on public.prospecto_atividades
  for each row execute function public.rejeitar_update_append_only();

alter table public.operadores            enable row level security;
alter table public.prospectos            enable row level security;
alter table public.prospecto_atividades  enable row level security;
alter table public.assinaturas           enable row level security;
alter table public.faturas               enable row level security;

grant select, insert, update on
  public.operadores, public.prospectos, public.assinaturas, public.faturas
  to whaviso_api;
grant select, insert on public.prospecto_atividades to whaviso_api;

create policy api_operadores           on public.operadores           for all to whaviso_api using (true) with check (true);
create policy api_prospectos           on public.prospectos           for all to whaviso_api using (true) with check (true);
create policy api_prospecto_atividades on public.prospecto_atividades for all to whaviso_api using (true) with check (true);
create policy api_assinaturas          on public.assinaturas          for all to whaviso_api using (true) with check (true);
create policy api_faturas              on public.faturas              for all to whaviso_api using (true) with check (true);
