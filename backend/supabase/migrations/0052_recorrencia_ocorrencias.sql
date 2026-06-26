-- 0052: Recorrência e cadência configuráveis (E6 H6.10 / E8 H8.7 / E9 H9.6).
--
-- Um combinado recorrente segue sendo UMA linha em `avisos` (uma anotação de agenda),
-- com uma tabela filha `aviso_ocorrencias` (uma linha por ocorrência: índice, data,
-- status e confirmação próprios). O `status` do aviso reflete a OCORRÊNCIA CORRENTE
-- (programado/informado_pago) e só vira `pago` terminal na ÚLTIMA ocorrência; o horário
-- reservado (H6.9) é COMPARTILHADO entre as ocorrências e só vira NULL no fim (o trigger
-- de 0038 já libera no terminal `pago`, que num recorrente só chega na última).
--
-- O ciclo de lembretes é gerado POR OCORRÊNCIA (lazy): ao confirmar a ocorrência k<N o
-- ponteiro `ocorrencia_atual` avança para k+1 e o mini-ciclo dela é gerado com o MESMO
-- horário. Os `envios` ganham `ocorrencia_id`; o unique (aviso_id, etapa) vira dois
-- índices PARCIAIS (um para o simples, outro por ocorrência no recorrente).
--
-- Numeração: última migration = 0051; esta é 0052. Só adiciona colunas/tabela/índices
-- (não usa valor de enum novo em DML), segura em auto-commit por statement.

-- ---------------------------------------------------------------------------------------
-- 1) Colunas de recorrência/cadência em `avisos`. Combinado SIMPLES = tudo NULL/default.
--    recorrencia_tipo  : null = simples; 'periodo' (freq+fim) | 'avulsas' (datas livres)
--    recorrencia_freq  : 'mensal' | 'semanal' | 'diaria' (só em 'periodo')
--    recorrencia_intervalo : "a cada N" (default 1)
--    ocorrencias_total : N
--    ocorrencia_atual  : ponteiro 1..N da ocorrência corrente
--    cadencia_etapas   : subconjunto de etapas do ciclo (null = ciclo completo D-2..D+1)
-- ---------------------------------------------------------------------------------------
alter table public.avisos add column if not exists recorrencia_tipo text;
alter table public.avisos add column if not exists recorrencia_freq text;
alter table public.avisos add column if not exists recorrencia_intervalo integer not null default 1;
alter table public.avisos add column if not exists ocorrencias_total integer;
alter table public.avisos add column if not exists ocorrencia_atual integer;
alter table public.avisos add column if not exists cadencia_etapas etapa_envio[];

alter table public.avisos drop constraint if exists avisos_recorrencia_tipo_chk;
alter table public.avisos add constraint avisos_recorrencia_tipo_chk
  check (recorrencia_tipo is null or recorrencia_tipo in ('periodo', 'avulsas'));

alter table public.avisos drop constraint if exists avisos_recorrencia_freq_chk;
alter table public.avisos add constraint avisos_recorrencia_freq_chk
  check (recorrencia_freq is null or recorrencia_freq in ('mensal', 'semanal', 'diaria'));

alter table public.avisos drop constraint if exists avisos_recorrencia_intervalo_chk;
alter table public.avisos add constraint avisos_recorrencia_intervalo_chk
  check (recorrencia_intervalo >= 1);

alter table public.avisos drop constraint if exists avisos_ocorrencias_total_chk;
alter table public.avisos add constraint avisos_ocorrencias_total_chk
  check (ocorrencias_total is null or ocorrencias_total >= 1);

alter table public.avisos drop constraint if exists avisos_ocorrencia_atual_chk;
alter table public.avisos add constraint avisos_ocorrencia_atual_chk
  check (ocorrencia_atual is null or ocorrencia_atual >= 1);

alter table public.avisos drop constraint if exists avisos_cadencia_etapas_chk;
alter table public.avisos add constraint avisos_cadencia_etapas_chk
  check (cadencia_etapas is null or array_length(cadencia_etapas, 1) >= 1);

-- Coerência: simples = sem recorrência; recorrente = tipo + total + ponteiro presentes
-- (e 'periodo' exige freq). Mantém impossível um aviso "meio recorrente".
alter table public.avisos drop constraint if exists avisos_recorrencia_coerente_chk;
alter table public.avisos add constraint avisos_recorrencia_coerente_chk check (
  (recorrencia_tipo is null
     and recorrencia_freq is null
     and ocorrencias_total is null
     and ocorrencia_atual is null)
  or
  (recorrencia_tipo is not null
     and ocorrencias_total is not null
     and ocorrencia_atual is not null
     and (recorrencia_tipo <> 'periodo' or recorrencia_freq is not null))
);

comment on column public.avisos.recorrencia_tipo is
  'E6/H6.10: null = combinado simples; periodo (freq+fim) ou avulsas (datas livres).';
comment on column public.avisos.ocorrencia_atual is
  'E8/H8.7: ponteiro 1..N da ocorrência corrente; o aviso só vira pago terminal quando a última é confirmada.';
comment on column public.avisos.cadencia_etapas is
  'E6/H6.10: subconjunto das etapas do ciclo a enviar; null = ciclo completo D-2..D+1.';

-- ---------------------------------------------------------------------------------------
-- 2) Tabela filha `aviso_ocorrencias`: uma linha por ocorrência do combinado recorrente.
--    Negócio append-only (sem DELETE; cascade do aviso permitido para manutenção). O
--    `status` usa o subconjunto do ciclo de pagamento (programado/informado_pago/pago).
-- ---------------------------------------------------------------------------------------
create table if not exists public.aviso_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  aviso_id uuid not null references public.avisos (id) on delete cascade,
  indice integer not null,
  data_combinada date not null,
  status status_aviso not null default 'programado',
  confirmado_em timestamptz,
  confirmado_por uuid references public.profiles (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint aviso_ocorrencias_indice_chk check (indice >= 1),
  constraint aviso_ocorrencias_status_chk check (status in ('programado', 'informado_pago', 'pago')),
  constraint aviso_ocorrencias_unica unique (aviso_id, indice)
);

create index if not exists idx_aviso_ocorrencias_aviso
  on public.aviso_ocorrencias (aviso_id, indice);

-- atualizado_em mantido pelo mesmo helper das demais tabelas (0003).
create or replace trigger trg_aviso_ocorrencias_atualizado_em
  before update on public.aviso_ocorrencias
  for each row execute function public.tocar_atualizado_em();

comment on table public.aviso_ocorrencias is
  'E8/H8.7: ocorrências de um combinado recorrente (índice 1..N, data, status e confirmação por ocorrência). O combinado é uma linha só em avisos; isto é a expansão por período.';

-- ---------------------------------------------------------------------------------------
-- 3) `envios.ocorrencia_id`: liga cada envio à ocorrência (null = combinado simples). O
--    unique (aviso_id, etapa) de 0004 vira DOIS índices parciais: um preserva o simples,
--    outro garante um ciclo por ocorrência no recorrente.
-- ---------------------------------------------------------------------------------------
alter table public.envios add column if not exists ocorrencia_id uuid
  references public.aviso_ocorrencias (id) on delete cascade;

alter table public.envios drop constraint if exists envios_unico_por_etapa;

create unique index if not exists envios_unico_etapa_simples
  on public.envios (aviso_id, etapa) where ocorrencia_id is null;
create unique index if not exists envios_unico_etapa_ocorrencia
  on public.envios (ocorrencia_id, etapa) where ocorrencia_id is not null;

-- ---------------------------------------------------------------------------------------
-- 4) Grants + RLS (padrão 0008). A api é dona das ocorrências (cria no criar/ativar,
--    confirma pelo painel, gera o ciclo da próxima ocorrência: já tem insert em envios).
--    O zap avança a ocorrência e gera o ciclo no aceite/confirmação por WhatsApp.
-- ---------------------------------------------------------------------------------------
grant select, insert, update on public.aviso_ocorrencias to whaviso_api;
grant select, insert, update on public.aviso_ocorrencias to whaviso_zap;

-- o zap precisa avançar o ponteiro de ocorrência no aviso (confirmação via WhatsApp);
-- já tem update(status) de 0008, que cobre voltar a `programado` entre ocorrências.
grant update (ocorrencia_atual) on public.avisos to whaviso_zap;

alter table public.aviso_ocorrencias enable row level security;

drop policy if exists api_aviso_ocorrencias on public.aviso_ocorrencias;
create policy api_aviso_ocorrencias on public.aviso_ocorrencias
  for all to whaviso_api using (true) with check (true);

drop policy if exists zap_aviso_ocorrencias on public.aviso_ocorrencias;
create policy zap_aviso_ocorrencias on public.aviso_ocorrencias
  for all to whaviso_zap using (true) with check (true);
