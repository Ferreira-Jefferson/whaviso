-- Templates (mensagens), outbox genérica de envio e idempotência de webhook.
--
-- templates: `loja_id` NULL = padrão da plataforma (herdado por todas as lojas); preenchido =
--   sobrescrita da loja (branding). `conteudo` é jsonb estruturado (texto + botões + mídia):
--   o transporte só lê a estrutura e envia, sem conhecer regra de negócio.
--     { "texto": "Oi, {{1}}!", "botoes": [{ "acao": "...", "rotulo": "..." }], "midia": {...} }
--   `acao` do botão é comportamento (mora no código; validada na api), só o rótulo é editável.
--
-- envios: outbox genérica. Quem produz (api, atendente) só ENFILEIRA; o zap DRENA e envia, com
--   claim FOR UPDATE SKIP LOCKED sobre o índice parcial de "due". Roteada por numero_whatsapp_id,
--   sem acoplamento a nenhum agregado (pedido/conversa são referências opcionais).
--   O destinatário é resolvido por cliente_id (telefone cifrado em clientes); aqui só o hash.
--
-- webhook_eventos_processados: idempotência at-most-once do inbound (a Meta reentrega).

create type status_meta_template as enum ('pendente', 'aprovado', 'rejeitado');
create type status_envio as enum ('agendado', 'processando', 'enviado', 'falhou', 'cancelado');
create type entrega_status as enum ('sent', 'delivered', 'read', 'failed');

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid references public.lojas (id) on delete cascade,   -- NULL = padrão da plataforma
  chave text not null,
  nome_meta text not null,
  idioma text not null default 'pt_BR',
  conteudo jsonb not null,
  variaveis jsonb not null default '[]'::jsonb,
  versao integer not null default 1,
  status_meta status_meta_template not null default 'pendente',
  ativo boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint templates_versao_positiva check (versao > 0),
  -- Vocabulário vetado em texto OU rótulo (mantido do baseline anterior; revisar a lista se a
  -- política de linguagem do produto novo mudar).
  constraint templates_linguagem_limpa
    check (conteudo::text !~* '(d[ií]vida|devendo|atras(o|ad)|cobran[çc]a|inadimpl)')
);
-- No máximo um template ativo por chave, no padrão da plataforma e em cada loja.
create unique index templates_padrao_ativo on public.templates (chave) where loja_id is null and ativo;
create unique index templates_loja_ativo on public.templates (loja_id, chave) where loja_id is not null and ativo;
-- nome_meta + versão são únicos no padrão e dentro de cada loja (a WABA é da loja).
create unique index templates_padrao_nome_versao on public.templates (nome_meta, versao) where loja_id is null;
create unique index templates_loja_nome_versao on public.templates (loja_id, nome_meta, versao) where loja_id is not null;

create table public.envios (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  numero_whatsapp_id uuid not null references public.numeros_whatsapp (id),
  cliente_id uuid references public.clientes (id),
  destinatario_hash text,
  template_chave text,                 -- NULL = texto livre (dentro da janela de 24h)
  payload jsonb not null,
  pedido_id uuid references public.pedidos (id),
  conversa_id uuid references public.conversas (id),
  dedupe_chave text,                   -- enfileirar duas vezes a mesma chave é no-op
  status status_envio not null default 'agendado',
  agendado_para timestamptz not null default now(),
  enviado_em timestamptz,
  tentativas smallint not null default 0,
  proxima_tentativa_em timestamptz,
  wamid text,
  entrega_status entrega_status,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint envios_destinatario_hash_fmt check (destinatario_hash is null or destinatario_hash ~ '^[0-9a-f]{64}$'),
  constraint envios_payload_objeto check (jsonb_typeof(payload) = 'object')
);
-- Índice do claim do scheduler (só o que ainda pode ser enviado).
create index envios_due on public.envios (agendado_para) where status in ('agendado', 'processando');
create index envios_wamid on public.envios (wamid) where wamid is not null;
create index envios_pedido on public.envios (pedido_id) where pedido_id is not null;
create index envios_conversa on public.envios (conversa_id) where conversa_id is not null;
create index envios_loja on public.envios (loja_id, criado_em);
create unique index envios_dedupe on public.envios (numero_whatsapp_id, dedupe_chave) where dedupe_chave is not null;

create table public.webhook_eventos_processados (
  wamid text primary key,                              -- id da mensagem inbound da Meta
  processado_em timestamptz not null default now()
);

create trigger trg_templates_atualizado_em before update on public.templates
  for each row execute function public.tocar_atualizado_em();
create trigger trg_envios_atualizado_em before update on public.envios
  for each row execute function public.tocar_atualizado_em();

alter table public.templates                    enable row level security;
alter table public.envios                       enable row level security;
alter table public.webhook_eventos_processados  enable row level security;

-- templates é configuração, não auditoria: a api tem DELETE só aqui (com guarda na api).
grant select, insert, update, delete on public.templates to whaviso_api;
grant select on public.templates to whaviso_zap, whaviso_atendente;

-- envios: api e atendente produzem; o zap consome e só escreve as colunas de transporte
-- (fronteira do outbox). O select continua liberado: o claim faz select ... for update, que
-- exige UPDATE em ao menos uma coluna (as concedidas abaixo cobrem).
grant select, insert, update on public.envios to whaviso_api;
grant select, insert on public.envios to whaviso_atendente;
grant select on public.envios to whaviso_zap;
grant update (status, enviado_em, wamid, erro, proxima_tentativa_em, tentativas, entrega_status)
  on public.envios to whaviso_zap;

-- Idempotência: o zap reivindica o wamid (insert) e confere (select). Marcador imutável.
grant select, insert on public.webhook_eventos_processados to whaviso_zap;

create policy api_templates       on public.templates for all    to whaviso_api       using (true) with check (true);
create policy zap_templates       on public.templates for select to whaviso_zap       using (true);
create policy atendente_templates on public.templates for select to whaviso_atendente using (true);

create policy api_envios       on public.envios for all to whaviso_api       using (true) with check (true);
create policy atendente_envios on public.envios for all to whaviso_atendente using (true) with check (true);
create policy zap_envios       on public.envios for all to whaviso_zap       using (true) with check (true);

create policy zap_webhook_dedupe on public.webhook_eventos_processados
  for all to whaviso_zap using (true) with check (true);

-- Catálogo de templates-padrão da plataforma (loja_id NULL). Vai em MIGRATION (upsert) porque o
-- seed não roda no cloud. Nascem pendentes e inativos: a aprovação na Meta é que ativa. A
-- exceção é o OTP de login, já aprovado. Textos neutros quanto a gênero, sem emoji nem travessão.
insert into public.templates (loja_id, chave, nome_meta, conteudo, variaveis, status_meta, ativo) values
  (null, 'auth.otp', 'whaviso_otp',
   '{"texto":"Seu código de acesso ao Whaviso é {{1}}. Ele vale por poucos minutos. Não compartilhe com ninguém."}'::jsonb,
   '["codigo"]'::jsonb, 'aprovado', true),
  (null, 'pedido.recebido', 'pedido_recebido',
   '{"texto":"Oi, {{1}}! Recebemos o pedido {{2}}. Avisamos por aqui quando começarmos o preparo."}'::jsonb,
   '["cliente_nome","pedido_codigo"]'::jsonb, 'pendente', false),
  (null, 'pedido.em_preparo', 'pedido_em_preparo',
   '{"texto":"O pedido {{1}} está em preparo. Falta pouco."}'::jsonb,
   '["pedido_codigo"]'::jsonb, 'pendente', false),
  (null, 'pedido.saiu_entrega', 'pedido_saiu_entrega',
   '{"texto":"O pedido {{1}} saiu para entrega e logo chega até você."}'::jsonb,
   '["pedido_codigo"]'::jsonb, 'pendente', false),
  (null, 'pedido.entregue', 'pedido_entregue',
   '{"texto":"O pedido {{1}} foi entregue. Bom apetite! Se algo não saiu como esperado, é só responder esta mensagem."}'::jsonb,
   '["pedido_codigo"]'::jsonb, 'pendente', false),
  (null, 'pedido.problema', 'pedido_problema',
   '{"texto":"Tivemos um imprevisto com o pedido {{1}}. Já estamos resolvendo e falamos com você por aqui."}'::jsonb,
   '["pedido_codigo"]'::jsonb, 'pendente', false),
  (null, 'pagamento.pix', 'pagamento_pix',
   '{"texto":"Pedido {{1}}: o total é {{2}}. Para pagar por Pix, use o código abaixo:\n{{3}}"}'::jsonb,
   '["pedido_codigo","total","br_code"]'::jsonb, 'pendente', false)
on conflict (nome_meta, versao) where loja_id is null
do update set
  chave = excluded.chave,
  conteudo = excluded.conteudo,
  variaveis = excluded.variaveis;
