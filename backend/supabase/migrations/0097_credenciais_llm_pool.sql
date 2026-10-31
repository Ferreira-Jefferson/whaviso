-- Pool de chaves de LLM da PLATAFORMA: o admin cadastra uma lista de chaves (ex.: uma conta
-- OpenRouter do whaviso) que uma loja pode usar em vez de cadastrar a propria (BYO,
-- credenciais_llm). Mesmo molde de seguranca de credenciais_llm (0012): envelope encryption,
-- api so escreve a cifra (nunca le de volta), so o atendente decifra. Sem DELETE (SEC-030).

create table public.credenciais_llm_pool (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  provedor provedor_llm not null default 'openrouter',
  chave_cifrada bytea not null,
  ultimos4 text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint credenciais_llm_pool_ultimos4_fmt check (ultimos4 is null or ultimos4 ~ '^[0-9A-Za-z]{2,8}$')
);
-- Nome e so rotulo de exibicao pro admin escolher na lista; unico (case-insensitive) evita confusao.
create unique index credenciais_llm_pool_nome on public.credenciais_llm_pool (lower(nome));

create trigger trg_credenciais_llm_pool_atualizado_em before update on public.credenciais_llm_pool
  for each row execute function public.tocar_atualizado_em();

alter table public.credenciais_llm_pool enable row level security;

-- api: escreve a chave (set/rotate) mas NUNCA a le de volta (mesmo padrao de credenciais_llm).
grant select (id, nome, provedor, ultimos4, ativo, criado_em, atualizado_em)
  on public.credenciais_llm_pool to whaviso_api;
grant insert (nome, provedor, chave_cifrada, ultimos4, ativo) on public.credenciais_llm_pool to whaviso_api;
grant update (nome, provedor, chave_cifrada, ultimos4, ativo) on public.credenciais_llm_pool to whaviso_api;

-- atendente: unico role que le a chave_cifrada, para decifrar na hora de chamar o provedor
-- quando a loja usa uma chave do pool (credenciais_llm.pool_chave_id aponta pra ca).
grant select (id, provedor, chave_cifrada, ativo) on public.credenciais_llm_pool to whaviso_atendente;

create policy api_credenciais_llm_pool on public.credenciais_llm_pool
  for all to whaviso_api using (true) with check (true);
create policy atendente_credenciais_llm_pool on public.credenciais_llm_pool
  for select to whaviso_atendente using (true);

-- credenciais_llm (por loja) ganha a opcao de referenciar uma chave do pool em vez de ter a
-- propria: exatamente UMA fonte setada (chave_cifrada XOR pool_chave_id). `chave_cifrada` deixa
-- de ser NOT NULL (passa a ser opcional quando a loja usa o pool).
alter table public.credenciais_llm
  alter column chave_cifrada drop not null,
  add column pool_chave_id uuid references public.credenciais_llm_pool (id),
  add constraint credenciais_llm_fonte_unica check (
    (chave_cifrada is not null and pool_chave_id is null) or
    (chave_cifrada is null and pool_chave_id is not null)
  );

-- Grants da coluna nova em credenciais_llm (a api atribui/le a referencia; o atendente le pra
-- decidir se junta com o pool na resolucao da credencial).
grant select (pool_chave_id) on public.credenciais_llm to whaviso_api;
grant insert (pool_chave_id) on public.credenciais_llm to whaviso_api;
grant update (pool_chave_id) on public.credenciais_llm to whaviso_api;
grant select (pool_chave_id) on public.credenciais_llm to whaviso_atendente;
