-- Central de Evals: ferramenta de PLATAFORMA (operador Whaviso) para testar a LLM e o RAG do
-- atendente. Nao e dado de loja: as suites/casos sao configuracao global; cada execucao mira UMA
-- loja alvo (loja_alvo_id), cuja credencial de LLM e base de conhecimento o runner usa.
--
--   eval_suites      suite de testes por tipo (rag_retrieval, rag_faithfulness, nlu_intencao,
--                    harness_turno). CONFIG: editavel, "remover" = ativo=false (a api tem DELETE
--                    como em templates, mas a UI desativa).
--   eval_casos       casos da suite (entrada/esperado em jsonb, validados por tipo na api). CONFIG.
--                    rag_retrieval NAO usa eval_casos: le o golden set (base_avaliacao) da loja alvo.
--   eval_execucoes   uma rodada de uma suite contra uma loja alvo. AUDITORIA: sem DELETE. A api
--                    enfileira (status fila); o atendente drena (claim FOR UPDATE SKIP LOCKED) e
--                    atualiza status/resumo.
--   eval_resultados  resultado por caso de uma execucao. AUDITORIA: o atendente insere, ninguem
--                    apaga. Um resultado por (execucao, caso).

create table public.eval_suites (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null,
  familia text not null default 'capability',
  descricao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint eval_suites_tipo_fmt
    check (tipo in ('rag_retrieval', 'rag_faithfulness', 'nlu_intencao', 'harness_turno')),
  constraint eval_suites_familia_fmt check (familia in ('capability', 'regression'))
);

create trigger trg_eval_suites_atualizado_em before update on public.eval_suites
  for each row execute function public.tocar_atualizado_em();

create table public.eval_casos (
  id uuid primary key default gen_random_uuid(),
  suite_id uuid not null references public.eval_suites (id),
  nome text not null,
  entrada jsonb not null,
  esperado jsonb not null default '{}'::jsonb,
  peso numeric not null default 1,
  ativo boolean not null default true,
  origem text not null default 'manual',
  criado_em timestamptz not null default now(),
  constraint eval_casos_origem_fmt check (origem in ('manual', 'producao'))
);
create index eval_casos_suite on public.eval_casos (suite_id) where ativo;

create table public.eval_execucoes (
  id uuid primary key default gen_random_uuid(),
  suite_id uuid not null references public.eval_suites (id),
  loja_alvo_id uuid not null references public.lojas (id),
  modelo text,
  provedor text,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'fila',
  baseline_execucao_id uuid references public.eval_execucoes (id),
  resumo jsonb,
  erro text,
  disparada_por uuid,
  criada_em timestamptz not null default now(),
  iniciada_em timestamptz,
  concluida_em timestamptz,
  constraint eval_execucoes_status_fmt
    check (status in ('fila', 'rodando', 'concluida', 'falha', 'cancelada'))
);
-- Serve o claim do runner (drena fila/rodando).
create index eval_execucoes_pendentes on public.eval_execucoes (status)
  where status in ('fila', 'rodando');
create index eval_execucoes_suite_tempo on public.eval_execucoes (suite_id, criada_em desc);

create table public.eval_resultados (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references public.eval_execucoes (id),
  -- Nullable: rag_retrieval avalia o golden set (base_avaliacao) da loja alvo, uma linha por
  -- pergunta, sem eval_caso. Os demais tipos sempre referenciam um caso. Nulos sao distintos no
  -- unique, entao varias linhas sem caso por execucao sao permitidas.
  caso_id uuid references public.eval_casos (id),
  status text not null,
  scores jsonb not null default '{}'::jsonb,
  saida jsonb,
  metricas jsonb,
  erro text,
  criado_em timestamptz not null default now(),
  constraint eval_resultados_status_fmt check (status in ('passou', 'falhou', 'erro')),
  constraint eval_resultados_unico unique (execucao_id, caso_id)
);
create index eval_resultados_execucao on public.eval_resultados (execucao_id);

alter table public.eval_suites      enable row level security;
alter table public.eval_casos       enable row level security;
alter table public.eval_execucoes   enable row level security;
alter table public.eval_resultados  enable row level security;

-- api: dona da configuracao (suites/casos, com DELETE como em templates) e do enfileiramento.
-- Execucoes: insert (enfileirar), select, update (cancelar, definir baseline); sem DELETE.
grant select, insert, update, delete on public.eval_suites to whaviso_api;
grant select, insert, update, delete on public.eval_casos to whaviso_api;
grant select, insert, update on public.eval_execucoes to whaviso_api;
grant select on public.eval_resultados to whaviso_api;

-- atendente (runner): le a configuracao, atualiza so as colunas de andamento da execucao e grava
-- os resultados. Sem DELETE em lugar nenhum.
grant select on public.eval_suites to whaviso_atendente;
grant select on public.eval_casos to whaviso_atendente;
grant select on public.eval_execucoes to whaviso_atendente;
grant update (status, resumo, erro, iniciada_em, concluida_em) on public.eval_execucoes to whaviso_atendente;
grant select, insert on public.eval_resultados to whaviso_atendente;

create policy api_eval_suites           on public.eval_suites     for all    to whaviso_api       using (true) with check (true);
create policy atendente_eval_suites     on public.eval_suites     for select to whaviso_atendente using (true);
create policy api_eval_casos            on public.eval_casos      for all    to whaviso_api       using (true) with check (true);
create policy atendente_eval_casos      on public.eval_casos      for select to whaviso_atendente using (true);
create policy api_eval_execucoes        on public.eval_execucoes  for all    to whaviso_api       using (true) with check (true);
create policy atendente_eval_execucoes  on public.eval_execucoes  for all    to whaviso_atendente using (true) with check (true);
create policy api_eval_resultados       on public.eval_resultados for select to whaviso_api       using (true);
create policy atendente_eval_resultados on public.eval_resultados for all    to whaviso_atendente using (true) with check (true);
