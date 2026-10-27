-- Campanhas de WhatsApp da loja sobre o consumidor final (marketing/relacionamento).
--
--   campanhas        uma campanha por loja: nome, template aprovado, numero de origem, filtro de
--                    segmento (jsonb) e variaveis fixas do template. Nasce `rascunho`; ao disparar
--                    vira `enfileirada` (todos os envios ja estao na outbox) e pode ser `cancelada`.
--   campanha_envios  uma linha por (campanha, cliente) efetivamente enfileirado: liga ao `envios`
--                    (outbox) por `envio_id`. Status de estado (`enfileirado`/`cancelado`); a entrega
--                    real (sent/delivered/read/failed) vive em `envios` e e lida por join.
--
-- Regras de seguranca/compliance desta migration (SEC-110, SEC-111; ver docs/pivot/SEGURANCA.md):
--   * Campanha NUNCA cruza loja: destinatarios so da propria loja (loja_id em toda consulta/linha).
--   * So atinge quem NAO tem opt-out de marketing (cliente_consentimento via view clientes_metricas).
--   * So sai por TEMPLATE aprovado pela Meta: o disparo e sempre `template_chave` + payload de
--     template, o caminho sancionado fora da janela de 24h. Texto livre nao e permitido em campanha.
-- Dinheiro em centavos; datas de negocio em America/Sao_Paulo (o banco guarda UTC). Sem DELETE
-- (tabelas de negocio mudam de estado, nunca somem). Nenhuma coluna de telefone/PII aqui: o
-- destinatario e resolvido por cliente_id no envio (o hash morador em `envios.destinatario_hash`).

create type status_campanha as enum ('rascunho', 'enfileirada', 'cancelada');
create type status_campanha_envio as enum ('enfileirado', 'cancelado');

create table public.campanhas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  nome text not null,
  template_chave text not null,
  numero_whatsapp_id uuid not null references public.numeros_whatsapp (id),
  -- Filtro do publico-alvo (ex.: { "segmento": "campeao" }). O opt-out e SEMPRE excluido,
  -- independente do filtro: nunca entra aqui como opcao de incluir quem recusou marketing.
  filtro jsonb not null default '{}'::jsonb,
  -- Variaveis fixas do template (mesmas para todos os destinatarios), por nome declarado no template.
  variaveis jsonb not null default '{}'::jsonb,
  status status_campanha not null default 'rascunho',
  total_destinatarios integer not null default 0,
  criado_por_user_id uuid,
  enfileirado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint campanhas_nome_tamanho check (char_length(nome) between 1 and 120),
  constraint campanhas_template_chave_nao_vazia check (char_length(template_chave) between 1 and 120),
  constraint campanhas_filtro_objeto check (jsonb_typeof(filtro) = 'object'),
  constraint campanhas_variaveis_objeto check (jsonb_typeof(variaveis) = 'object'),
  constraint campanhas_total_nao_negativo check (total_destinatarios >= 0)
);
create index campanhas_loja on public.campanhas (loja_id, criado_em desc);

create table public.campanha_envios (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas (id) on delete cascade,
  loja_id uuid not null references public.lojas (id) on delete cascade,
  cliente_id uuid not null references public.clientes (id),
  -- Linha do outbox que materializa este envio (NULL so em estado degradado; normalmente preenchido).
  envio_id uuid references public.envios (id),
  status status_campanha_envio not null default 'enfileirado',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
-- Um cliente aparece no maximo uma vez por campanha (idempotencia do disparo).
create unique index campanha_envios_unico on public.campanha_envios (campanha_id, cliente_id);
create index campanha_envios_loja on public.campanha_envios (loja_id);
create index campanha_envios_envio on public.campanha_envios (envio_id) where envio_id is not null;

create trigger trg_campanhas_atualizado_em before update on public.campanhas
  for each row execute function public.tocar_atualizado_em();
create trigger trg_campanha_envios_atualizado_em before update on public.campanha_envios
  for each row execute function public.tocar_atualizado_em();

alter table public.campanhas       enable row level security;
alter table public.campanha_envios enable row level security;

-- api e dona das duas tabelas: cria/dispara/cancela campanha e registra o par (campanha, cliente).
-- Sem DELETE (SEC-030: negocio muda de estado, nao some). zap/atendente nao tocam campanhas: o
-- transporte so conhece a outbox `envios` (ja produzida pela api aqui).
grant select, insert, update on public.campanhas       to whaviso_api;
grant select, insert, update on public.campanha_envios to whaviso_api;

-- Isolamento multi-tenant e enforcado na api por loja_id em toda consulta (padrao do projeto);
-- as policies liberam o role de servico, como nas demais tabelas de dominio da api.
create policy api_campanhas       on public.campanhas       for all to whaviso_api using (true) with check (true);
create policy api_campanha_envios on public.campanha_envios for all to whaviso_api using (true) with check (true);
