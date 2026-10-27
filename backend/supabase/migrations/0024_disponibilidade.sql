-- Disponibilidade da loja: quando atende/aceita pedidos e quando o atendente (IA) pode responder.
-- Tres tabelas por loja (multi-tenant por loja_id). O estado "aceitando agora" NAO e persistido:
-- a api o deriva dos horarios + excecoes + agora em America/Sao_Paulo. Sem DELETE: remocao e
-- logica (coluna `ativo`). atendente (IA) le as tres tabelas para decidir se responde/atende.

-- 1. Horarios de funcionamento: varias faixas por dia da semana (ex.: almoco e jantar = 2 linhas).
--    A nao-sobreposicao de faixas do mesmo dia e regra do service (depende do fuso e do estado ativo).
create table public.horarios_funcionamento (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  dia_semana smallint not null,            -- 0 = domingo ... 6 = sabado
  abre time not null,
  fecha time not null,
  ativo boolean not null default true,     -- remocao logica (nao ha DELETE)
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint horarios_dia_semana_valido check (dia_semana between 0 and 6),
  constraint horarios_faixa_nao_vazia check (abre <> fecha)
);
create index horarios_loja on public.horarios_funcionamento (loja_id);
create index horarios_loja_dia on public.horarios_funcionamento (loja_id, dia_semana) where ativo;

-- 2. Janela do atendente (IA): fora dela, o atendente nao responde. Uma linha por loja (pk = loja_id).
create table public.janela_atendente (
  loja_id uuid primary key references public.lojas (id) on delete cascade,
  inicio time not null,
  fim time not null,
  dias smallint[] not null,                -- dias da semana ativos (0..6)
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  constraint janela_inicio_fim_distintos check (inicio <> fim),
  constraint janela_dias_validos check (
    array_length(dias, 1) between 1 and 7 and dias <@ array[0,1,2,3,4,5,6]::smallint[]
  )
);

-- 3. Excecoes/feriados: uma data em que a loja fecha ou muda o horario. Remocao e logica (ativo);
--    o indice unico cobre so a excecao ATIVA, entao reativar/recadastrar uma data e possivel.
create table public.excecoes_disponibilidade (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  data date not null,
  fechado boolean not null default true,
  abre time,
  fecha time,
  motivo text,
  ativo boolean not null default true,     -- remocao logica (nao ha DELETE)
  criado_em timestamptz not null default now(),
  constraint excecoes_horario_quando_aberto check (
    fechado or (abre is not null and fecha is not null and abre <> fecha)
  )
);
create unique index excecoes_loja_data on public.excecoes_disponibilidade (loja_id, data) where ativo;
create index excecoes_loja on public.excecoes_disponibilidade (loja_id);

create trigger trg_horarios_atualizado_em before update on public.horarios_funcionamento
  for each row execute function public.tocar_atualizado_em();
create trigger trg_janela_atendente_atualizado_em before update on public.janela_atendente
  for each row execute function public.tocar_atualizado_em();

-- RLS deny-all para anon/authenticated (os grants/revokes de 0001 ja tiram o teto deles);
-- aqui ligamos RLS e abrimos so para os roles de servico via policy using(true).
alter table public.horarios_funcionamento    enable row level security;
alter table public.janela_atendente          enable row level security;
alter table public.excecoes_disponibilidade  enable row level security;

-- api: dona da configuracao (SELECT/INSERT/UPDATE; sem DELETE, remocao e logica).
-- atendente (IA): SELECT nas tres, para decidir se atende/responde. zap: sem grant.
grant select, insert, update on public.horarios_funcionamento   to whaviso_api;
grant select, insert, update on public.janela_atendente         to whaviso_api;
grant select, insert, update on public.excecoes_disponibilidade to whaviso_api;
grant select on public.horarios_funcionamento   to whaviso_atendente;
grant select on public.janela_atendente         to whaviso_atendente;
grant select on public.excecoes_disponibilidade to whaviso_atendente;

create policy api_horarios   on public.horarios_funcionamento   for all    to whaviso_api       using (true) with check (true);
create policy api_janela     on public.janela_atendente         for all    to whaviso_api       using (true) with check (true);
create policy api_excecoes   on public.excecoes_disponibilidade for all    to whaviso_api       using (true) with check (true);
create policy atendente_horarios on public.horarios_funcionamento   for select to whaviso_atendente using (true);
create policy atendente_janela   on public.janela_atendente         for select to whaviso_atendente using (true);
create policy atendente_excecoes on public.excecoes_disponibilidade for select to whaviso_atendente using (true);
