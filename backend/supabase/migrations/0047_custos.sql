-- Custos externos da plataforma (LLM, WhatsApp, mapas, fiscal): razao de eventos de custo e
-- catalogo de tarifas da Meta. Alimenta a visao de custo da loja, a metrica agregada do operador
-- e o alerta de custo diario anomalo (SEC-100).
--
--   eventos_custo  razao APPEND-ONLY: uma linha por custo incorrido. SO metadado de custo
--                  (categoria, origem, valor, quantidade, ids de referencia). NAO existe coluna de
--                  conteudo (mensagem, prompt, resposta, telefone): o operador agrega, nunca ve
--                  conteudo (SEC-003). A loja le apenas as proprias linhas (filtro por loja_id na api).
--   tarifas_meta   catalogo de tarifas da Meta por pais x categoria, com vigencia. Leitura pela api;
--                  a escrita e por migration/operacao (nenhum grant de escrita ao runtime).
--
-- Dinheiro em centavos (inteiro). Custos de fracao de centavo (ex.: um turno de LLM) sao
-- acumulados pelo produtor (arredondado para cima por evento); `quantidade` guarda as unidades
-- (tokens, mensagens, requisicoes) e `valor_centavos` o custo total do evento. Datas de negocio em
-- America/Sao_Paulo (o banco guarda UTC). Sem DELETE e sem UPDATE: correcao = novo evento (estorno
-- nao e modelado; ajuste e feito por evento de origem propria).

create type categoria_custo as enum ('llm', 'whatsapp', 'mapas', 'fiscal');
create type categoria_tarifa_meta as enum ('marketing', 'utility', 'authentication', 'service');

create table public.eventos_custo (
  id uuid primary key default gen_random_uuid(),
  -- NULL = custo de plataforma sem loja (ex.: OTP de login). A loja nunca ve linha sem loja_id.
  loja_id uuid references public.lojas (id) on delete cascade,
  categoria categoria_custo not null,
  -- Modulo/produtor do custo (ex.: atendente, zap.campanha, mapas.rota). Texto curto controlado.
  origem text not null,
  valor_centavos integer not null default 0,
  quantidade integer not null default 1,
  -- Ids de correlacao (id de pedido, de envio, de uso_llm...), NUNCA conteudo nem telefone.
  referencia text,
  -- Idempotencia do produtor: reenvio do mesmo (origem, chave) nao duplica o custo.
  chave_idempotencia text,
  criado_em timestamptz not null default now(),
  constraint eventos_custo_valor_nao_negativo check (valor_centavos >= 0),
  constraint eventos_custo_quantidade_nao_negativa check (quantidade >= 0),
  constraint eventos_custo_origem_formato check (origem ~ '^[a-z0-9_.]{1,60}$'),
  constraint eventos_custo_referencia_formato
    check (referencia is null or referencia ~ '^[A-Za-z0-9_.:-]{1,120}$'),
  constraint eventos_custo_chave_formato
    check (chave_idempotencia is null or chave_idempotencia ~ '^[A-Za-z0-9_.:-]{1,120}$')
);
create index eventos_custo_loja_tempo on public.eventos_custo (loja_id, criado_em);
create index eventos_custo_tempo on public.eventos_custo (criado_em);
create unique index eventos_custo_idempotencia
  on public.eventos_custo (origem, chave_idempotencia) where chave_idempotencia is not null;

create trigger trg_eventos_custo_append_only before update on public.eventos_custo
  for each row execute function public.rejeitar_update_append_only();

create table public.tarifas_meta (
  id uuid primary key default gen_random_uuid(),
  pais char(2) not null,
  categoria categoria_tarifa_meta not null,
  -- Custo por mensagem entregue, em centavos de BRL.
  valor_centavos integer not null,
  vigencia_inicio date not null,
  vigencia_fim date,
  criado_em timestamptz not null default now(),
  constraint tarifas_meta_pais_formato check (pais ~ '^[A-Z]{2}$'),
  constraint tarifas_meta_valor_nao_negativo check (valor_centavos >= 0),
  constraint tarifas_meta_vigencia check (vigencia_fim is null or vigencia_fim >= vigencia_inicio),
  constraint tarifas_meta_unica unique (pais, categoria, vigencia_inicio)
);

alter table public.eventos_custo enable row level security;
alter table public.tarifas_meta enable row level security;

-- Produtores gravam (api, zap, atendente); so a api le (loja e operador, escopo no app).
grant insert on public.eventos_custo to whaviso_api, whaviso_zap, whaviso_atendente;
grant select on public.eventos_custo to whaviso_api;
grant select on public.tarifas_meta to whaviso_api;

create policy api_eventos_custo_sel      on public.eventos_custo for select to whaviso_api       using (true);
create policy api_eventos_custo_ins      on public.eventos_custo for insert to whaviso_api       with check (true);
create policy zap_eventos_custo_ins      on public.eventos_custo for insert to whaviso_zap       with check (true);
create policy atendente_eventos_custo_ins on public.eventos_custo for insert to whaviso_atendente with check (true);
create policy api_tarifas_meta_sel       on public.tarifas_meta  for select to whaviso_api       using (true);
