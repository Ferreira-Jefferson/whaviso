-- Camada de conhecimento do atendente (RAG): documento curavel + chunk embeddado + golden set +
-- fila de realimentacao, mais os deltas em uso_llm e cache_semantico. Fonte do desenho:
-- docs/pivot/RAG.md (secoes 2, 4, 5 e 7.1). Historia: historias/backend-atendente/rag.md.
--
-- Principios materializados aqui (nao reverter sem combinar):
--   * Isolamento por loja e imposto no SQL: todo chunk/documento carrega loja_id e o retrieval
--     pre-filtra WHERE loja_id antes do ranqueamento (RAG-ISO-001 / SEC-062). loja_id desnormalizado
--     em chunks (indexado) para o pre-filtro entrar antes do vetor.
--   * Dado ao-vivo (preco, disponibilidade, status) NUNCA entra no indice nem no cache: a regra e da
--     aplicacao (validador de ingestao + classificador de cache); o banco guarda a invariante
--     contem_dado_vivo = false no cache como guarda-costas.
--   * A chave de LLM nunca e conhecimento: documentos/chunks nao contem segredo (validador barra).
--   * embedding/rerank sao credencial da PLATAFORMA (fora de credenciais_llm); uso_llm.tipo_uso separa
--     geracao (BYO por loja) de embedding/rerank (plataforma) no painel e no alerta de pico.
--
-- Portabilidade do vetor: a coluna embedding e os indices HNSW so nascem quando a extensao `vector`
-- existe (igual a 0011). Sem a extensao, o retrieval degrada para BM25 (tsvector) sozinho; o
-- pre-filtro por loja e o isolamento continuam identicos. A dimensao 1536 espelha a 0011.

create type documento_tipo as enum ('descricao', 'regra', 'faq', 'politica');
create type documento_status as enum ('rascunho', 'aprovado', 'arquivado');
create type documento_origem as enum ('manual', 'importado', 'realimentado');
create type rag_feedback_tipo as enum ('lacuna', 'recorrente', 'correcao_humana');
create type rag_feedback_status as enum ('novo', 'triado', 'promovido', 'descartado');

-- documentos: unidade curavel e versionada pelo dono (evolucao de base_conhecimento). A api cura
-- (escreve); o atendente le so os aprovados e insere rascunhos vindos da realimentacao.
create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  tipo documento_tipo not null,
  titulo text not null,
  conteudo text not null,
  status documento_status not null default 'rascunho',
  origem documento_origem not null default 'manual',
  versao integer not null default 1,
  substitui_id uuid references public.documentos (id),   -- cadeia de versoes (self-FK)
  fonte_conversa_id uuid references public.conversas (id),
  fonte_mensagem_id uuid references public.mensagens (id),
  hash_conteudo text,                                    -- dedup (sha256 hex do conteudo normalizado)
  criado_por uuid,
  aprovado_por uuid,
  aprovado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint documentos_hash_fmt check (hash_conteudo is null or hash_conteudo ~ '^[0-9a-f]{64}$')
);
create index documentos_loja_status on public.documentos (loja_id, status);
create index documentos_loja_hash on public.documentos (loja_id, hash_conteudo);

create trigger trg_documentos_atualizado_em before update on public.documentos
  for each row execute function public.tocar_atualizado_em();

-- chunks: unidade de retrieval, dona do vetor. loja_id desnormalizado para o pre-filtro. tsv e
-- coluna gerada (dicionario portuguese) sobre o texto contextualizado (ou o cru, se sem contexto).
create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.documentos (id) on delete cascade,
  loja_id uuid not null references public.lojas (id) on delete cascade,
  ordem integer not null default 0,
  texto text not null,
  texto_contextualizado text,                            -- prefixo do Contextual Retrieval (RAG.md 2)
  embedding_model text,                                  -- modelo que gerou o vetor (propriedade do indice)
  token_count integer,
  tsv tsvector generated always as
    (to_tsvector('portuguese', coalesce(texto_contextualizado, texto))) stored,
  criado_em timestamptz not null default now()
);
create index chunks_loja on public.chunks (loja_id);
create index chunks_documento on public.chunks (documento_id);
create index chunks_tsv on public.chunks using gin (tsv);

-- base_avaliacao: golden set por loja (semente do onboarding + realimentacao aprovada). Alimenta o
-- hit@k deterministico (RAG-EVAL-001). docs_esperados = ids de documentos que DEVERIAM ser recuperados.
create table public.base_avaliacao (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  pergunta text not null,
  resposta_esperada text,
  docs_esperados uuid[] not null default '{}',
  tipo documento_tipo,
  ativo boolean not null default true,
  origem text not null default 'semente',                -- semente | realimentado
  criado_em timestamptz not null default now()
);
create index base_avaliacao_loja on public.base_avaliacao (loja_id) where ativo;

-- rag_feedback: fila da realimentacao (o chat produz candidatos; o dono promove). O atendente
-- enfileira o sinal; a api (curadoria) triará o status e liga ao rascunho gerado.
create table public.rag_feedback (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  conversa_id uuid references public.conversas (id),
  mensagem_id uuid references public.mensagens (id),
  tipo rag_feedback_tipo not null,
  texto text not null,
  ocorrencias integer not null default 1,
  status rag_feedback_status not null default 'novo',
  documento_rascunho_id uuid references public.documentos (id),
  criado_em timestamptz not null default now()
);
create index rag_feedback_loja_status on public.rag_feedback (loja_id, status);

-- Coluna de embedding e indices vetoriais so existem com a extensao `vector` (igual a 0011).
-- Dimensao 1536; trocar de modelo de embedding = reembeddar (job explicito), nunca acidente.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    alter table public.chunks add column if not exists embedding vector(1536);
    create index if not exists chunks_embedding on public.chunks
      using hnsw (embedding vector_cosine_ops);
  else
    raise notice 'vector ausente: chunks nasce sem a coluna embedding (retrieval degrada para BM25)';
  end if;
end
$$;

-- Delta uso_llm (RAG.md 4 e 7.1): tipo_uso separa geracao (BYO por loja) de embedding/rerank
-- (plataforma). Default 'geracao' preserva os INSERTs ja existentes do llm_client (geracao/STT/visao).
alter table public.uso_llm add column if not exists tipo_uso text not null default 'geracao';
alter table public.uso_llm drop constraint if exists uso_llm_tipo_uso_fmt;
alter table public.uso_llm add constraint uso_llm_tipo_uso_fmt
  check (tipo_uso in ('geracao', 'embedding', 'rerank'));

-- Delta cache_semantico (RAG.md 4 e 7.1): invariante contem_dado_vivo = false (guarda contra bug de
-- cachear preco/disponibilidade/status) + o modelo de embedding da pergunta. A coluna embedding ja
-- veio (condicional) da 0011; o lookup sempre carrega loja_id + nao-expirado + contem_dado_vivo=false.
alter table public.cache_semantico add column if not exists contem_dado_vivo boolean not null default false;
alter table public.cache_semantico add column if not exists embedding_model text;

alter table public.documentos     enable row level security;
alter table public.chunks         enable row level security;
alter table public.base_avaliacao enable row level security;
alter table public.rag_feedback   enable row level security;

-- documentos: api cura (select/insert/update; sem delete, "remover" e arquivar via status). O
-- atendente le (so aprovados, filtrado na query) e insere rascunhos da realimentacao.
grant select, insert, update on public.documentos to whaviso_api;
grant select, insert on public.documentos to whaviso_atendente;

-- chunks: o atendente e dono do vetor (ingestao reindexa = delete + insert). A api so le (status do
-- indice no painel de curadoria), nunca escreve o vetor.
grant select, insert, update, delete on public.chunks to whaviso_atendente;
grant select on public.chunks to whaviso_api;

-- base_avaliacao: a api (API-conhecimento) cura o golden set; o atendente le para rodar o hit@k.
grant select, insert, update on public.base_avaliacao to whaviso_api;
grant select on public.base_avaliacao to whaviso_atendente;

-- rag_feedback: o atendente enfileira o sinal (select/insert); a api tria (select/update), sem delete.
grant select, insert on public.rag_feedback to whaviso_atendente;
grant select, update on public.rag_feedback to whaviso_api;

create policy api_documentos       on public.documentos for all    to whaviso_api       using (true) with check (true);
create policy atendente_documentos on public.documentos for all    to whaviso_atendente using (true) with check (true);
create policy atendente_chunks     on public.chunks     for all    to whaviso_atendente using (true) with check (true);
create policy api_chunks           on public.chunks     for select to whaviso_api       using (true);
create policy api_base_avaliacao       on public.base_avaliacao for all    to whaviso_api       using (true) with check (true);
create policy atendente_base_avaliacao on public.base_avaliacao for select to whaviso_atendente using (true);
create policy atendente_rag_feedback on public.rag_feedback for all    to whaviso_atendente using (true) with check (true);
create policy api_rag_feedback       on public.rag_feedback for all    to whaviso_api       using (true) with check (true);
