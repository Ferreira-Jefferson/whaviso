-- Importacao de cardapio por foto/PDF: fila + rascunho (modulo API cardapio_importacao).
--
-- Fluxo assincrono (a api nunca le a chave de LLM; so o atendente decifra):
--   1. a api recebe o arquivo, valida (assinatura, tamanho) e insere a linha em `fila`;
--   2. o consumidor no atendente (AT-importar) reivindica a linha (FOR UPDATE SKIP LOCKED, mesmo
--      padrao do outbox), chama o LLM multimodal e grava `rascunho` + `rascunho_pronto` (ou `erro`);
--   3. o dono revisa/edita o rascunho na api e APROVA (gera o lote para o cardapio) ou DESCARTA.
-- Nada vai ao cardapio sem aprovacao humana; a saida do modelo e so rascunho (SEC-060/061).
--
-- Retencao: o arquivo bruto (`arquivo_bytes`, teto 10 MB) e zerado ao terminar qualquer estado final
-- (pronto, erro, aprovada, descartada). `erro` guarda so um CODIGO sanitizado, nunca a resposta crua
-- do provedor (pode vir com trecho do prompt/segredo). Sem DELETE (negocio muda de estado).

create type status_importacao_cardapio as enum
  ('fila', 'processando', 'rascunho_pronto', 'erro', 'aprovada', 'descartada');
create type tipo_arquivo_importacao as enum ('imagem', 'pdf');

create table public.importacoes_cardapio (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  status status_importacao_cardapio not null default 'fila',
  tipo_arquivo tipo_arquivo_importacao not null,
  mime text not null,                          -- derivado da ASSINATURA do arquivo, nunca do cliente
  arquivo_bytes bytea,                         -- <= 10 MB; NULL apos estado final
  arquivo_hash text not null,                  -- sha256 hex do arquivo (idempotencia de duplo envio)
  tamanho_bytes integer not null,
  rascunho jsonb,                              -- RascunhoCardapio (categorias > itens > grupos > opcoes)
  erro text,                                   -- codigo sanitizado (ex.: llm_sem_visao), nunca texto cru
  tentativas integer not null default 0,
  processando_desde timestamptz,               -- p/ recuperar job preso em `processando`
  criado_por_user_id uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint importacoes_hash_fmt check (arquivo_hash ~ '^[0-9a-f]{64}$'),
  constraint importacoes_tamanho check (tamanho_bytes between 1 and 10485760),
  constraint importacoes_bytes_teto check (arquivo_bytes is null or octet_length(arquivo_bytes) <= 10485760),
  constraint importacoes_rascunho_objeto check (rascunho is null or jsonb_typeof(rascunho) = 'object'),
  constraint importacoes_erro_tamanho check (erro is null or char_length(erro) <= 80),
  constraint importacoes_tentativas check (tentativas >= 0)
);
create index importacoes_cardapio_loja on public.importacoes_cardapio (loja_id, criado_em desc);
-- Claim do consumidor (fila FIFO) e recuperacao de preso.
create index importacoes_cardapio_claim on public.importacoes_cardapio (criado_em) where status = 'fila';
create index importacoes_cardapio_preso on public.importacoes_cardapio (processando_desde)
  where status = 'processando';
-- Idempotencia de duplo envio: consulta por (loja, hash) recente.
create index importacoes_cardapio_hash on public.importacoes_cardapio (loja_id, arquivo_hash, criado_em desc);

create trigger trg_importacoes_cardapio_atualizado_em before update on public.importacoes_cardapio
  for each row execute function public.tocar_atualizado_em();

alter table public.importacoes_cardapio enable row level security;

-- api: cria, le (SEM arquivo_bytes: o binario nunca volta em consulta) e atualiza estado/rascunho;
-- zera os bytes ao aprovar/descartar. Sem DELETE (SEC-030).
grant select (id, loja_id, status, tipo_arquivo, mime, arquivo_hash, tamanho_bytes, rascunho, erro,
              tentativas, processando_desde, criado_por_user_id, criado_em, atualizado_em)
  on public.importacoes_cardapio to whaviso_api;
grant insert (loja_id, tipo_arquivo, mime, arquivo_bytes, arquivo_hash, tamanho_bytes, criado_por_user_id)
  on public.importacoes_cardapio to whaviso_api;
grant update (status, rascunho, erro, arquivo_bytes, tentativas, processando_desde)
  on public.importacoes_cardapio to whaviso_api;

-- atendente (AT-importar): reivindica (claim) e conclui. Le o binario para enviar ao provedor;
-- nao cria linhas nem apaga. Sem acesso a billing/plataforma (SEC-032).
grant select (id, loja_id, status, tipo_arquivo, mime, arquivo_bytes, tentativas, processando_desde, criado_em)
  on public.importacoes_cardapio to whaviso_atendente;
grant update (status, rascunho, erro, arquivo_bytes, tentativas, processando_desde)
  on public.importacoes_cardapio to whaviso_atendente;

create policy api_importacoes_cardapio       on public.importacoes_cardapio for all    to whaviso_api       using (true) with check (true);
create policy atendente_importacoes_cardapio_sel on public.importacoes_cardapio for select to whaviso_atendente using (true);
create policy atendente_importacoes_cardapio_upd on public.importacoes_cardapio for update to whaviso_atendente using (true) with check (true);
