-- Credenciais de LLM por loja (BYO key) e contabilidade de consumo.
--
-- Este e o segredo mais caro do banco: uma chave vazada vira custo imediato para o cliente e para
-- nos. O tratamento segue o mesmo molde do token da Meta em numeros_whatsapp, so que mais apertado:
--   * chave_cifrada: cifra da aplicacao (envelope encryption; a master key mora FORA do banco, num
--     secret manager). Um dump do banco sozinho nao revela chave nenhuma.
--   * Privilegio por coluna: a api ESCREVE (set/rotate) e le so os metadados, NUNCA a chave_cifrada.
--     So o worker atendente le a chave_cifrada, para decifrar no momento da chamada ao provedor.
--   * O texto claro nunca volta para o cliente (campo write-only na tela) nem entra em log.
-- Ver docs/pivot/SEGURANCA.md para o plano de teste desta superficie.

create type provedor_llm as enum ('openrouter', 'anthropic', 'outro');

create table public.credenciais_llm (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  provedor provedor_llm not null default 'openrouter',
  chave_cifrada bytea not null,              -- cifra da aplicacao; master key fora do banco
  ultimos4 text,                             -- so para exibir "configurada (...1234)"
  modelo_preferido text,
  ativo boolean not null default true,
  validada_em timestamptz,                   -- ultima vez que uma chamada de teste passou
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint credenciais_ultimos4_fmt check (ultimos4 is null or ultimos4 ~ '^[0-9A-Za-z]{2,8}$')
);
-- Uma credencial por loja (trocar de provedor sobrescreve a mesma linha).
create unique index credenciais_llm_loja on public.credenciais_llm (loja_id);

create trigger trg_credenciais_atualizado_em before update on public.credenciais_llm
  for each row execute function public.tocar_atualizado_em();

alter table public.credenciais_llm enable row level security;

-- api: escreve a chave (set/rotate) mas NUNCA a le de volta. O select dela e so dos metadados;
-- chave_cifrada fica de fora do grant de select de proposito. Sem DELETE: "remover" e sobrescrever
-- a chave e marcar ativo=false (a api tem update em chave_cifrada).
grant select (id, loja_id, provedor, ultimos4, modelo_preferido, ativo, validada_em, criado_em, atualizado_em)
  on public.credenciais_llm to whaviso_api;
grant insert (loja_id, provedor, chave_cifrada, ultimos4, modelo_preferido, ativo)
  on public.credenciais_llm to whaviso_api;
grant update (provedor, chave_cifrada, ultimos4, modelo_preferido, ativo, validada_em)
  on public.credenciais_llm to whaviso_api;

-- atendente: unico role que le a chave_cifrada, para decifrar na hora de chamar o provedor.
grant select (id, loja_id, provedor, chave_cifrada, modelo_preferido, ativo)
  on public.credenciais_llm to whaviso_atendente;

create policy api_credenciais       on public.credenciais_llm for all    to whaviso_api       using (true) with check (true);
create policy atendente_credenciais on public.credenciais_llm for select to whaviso_atendente using (true);

-- Contabilidade de consumo: alimenta o painel de gasto da loja e o alerta de uso anomalo (defesa
-- contra vazamento: pico de gasto estranho pede investigacao). Append-only, sem PII.
create table public.uso_llm (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  provedor provedor_llm not null,
  modelo text,
  origem text,                               -- modulo que consumiu (cardapio_importacao, atendente, ...)
  tokens_entrada integer not null default 0,
  tokens_saida integer not null default 0,
  custo_estimado_centavos integer not null default 0,
  criado_em timestamptz not null default now()
);
create index uso_llm_loja_tempo on public.uso_llm (loja_id, criado_em);

alter table public.uso_llm enable row level security;

-- atendente grava o consumo; api le para o painel. Append-only: sem UPDATE e sem DELETE.
grant insert on public.uso_llm to whaviso_atendente;
grant select on public.uso_llm to whaviso_api, whaviso_atendente;

create trigger trg_uso_llm_append_only before update on public.uso_llm
  for each row execute function public.rejeitar_update_append_only();

create policy atendente_uso_llm on public.uso_llm for insert to whaviso_atendente with check (true);
create policy api_uso_llm       on public.uso_llm for select to whaviso_api       using (true);
create policy atendente_uso_llm_sel on public.uso_llm for select to whaviso_atendente using (true);
