-- Controle de acesso por e-mail APROVADO (allowlist de login) + outbox de e-mail.
--
-- Problema: hoje qualquer identidade autenticada no Supabase (Google/WhatsApp OTP) consegue
-- criar a primeira conta por POST /v1/conta, sem nenhum filtro. Isto fecha essa porta: o
-- bootstrap de conta passa a exigir que o e-mail do usuario esteja APROVADO nesta lista.
-- Quem ja e membro de uma conta (convidado por um dono) nao passa por aqui, entao nao e afetado.
--
-- Fluxo (decidido com o dono): aprovar antes, conta depois.
--   - operador adiciona/aprova um e-mail na tela de Acessos de login (permissao cobranca:gerir); ou
--   - a baixa manual de uma fatura/assinatura aprova o e-mail do dono automaticamente (origem pagamento).
--   Em qualquer caminho de aprovacao, um e-mail de boas-vindas e enfileirado em emails_outbox.
--
-- acessos_permitidos: lista de e-mails. Sem DELETE (negocio, nao some): revogar e mudanca de status.
-- emails_outbox: outbox de e-mail no mesmo padrao de `envios` (claim FOR UPDATE SKIP LOCKED, dedupe,
--   backoff). Quem produz (api) ENFILEIRA; o zap DRENA e envia (via Resend). Reusa o enum status_envio.

create type acesso_status as enum ('pendente', 'aprovado', 'revogado');
create type acesso_origem as enum ('pagamento', 'admin');

create table public.acessos_permitidos (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  status acesso_status not null default 'pendente',
  origem acesso_origem not null default 'admin',
  conta_id uuid references public.contas (id) on delete set null,  -- vinculo opcional (aprovacao por pagamento)
  observacao text,
  aprovado_por uuid,                 -- operador que aprovou (auth.users.id); sem FK p/ nao acoplar a auth
  aprovado_em timestamptz,
  boas_vindas_enviado_em timestamptz,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint acessos_permitidos_email_fmt check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint acessos_permitidos_aprovado_coerente
    check ((status = 'aprovado') = (aprovado_em is not null))
);
-- Um e-mail e unico, case-insensitive (o gate normaliza para lower antes de consultar).
create unique index acessos_permitidos_email_uniq on public.acessos_permitidos (lower(email));
create index acessos_permitidos_status on public.acessos_permitidos (status, criado_em desc);

create table public.emails_outbox (
  id uuid primary key default gen_random_uuid(),
  para text not null,
  template text not null,            -- chave logica renderizada no zap (ex.: 'boas_vindas')
  payload jsonb not null default '{}'::jsonb,
  dedupe_chave text,                 -- enfileirar duas vezes a mesma chave e no-op
  status status_envio not null default 'agendado',
  agendado_para timestamptz not null default now(),
  enviado_em timestamptz,
  tentativas smallint not null default 0,
  proxima_tentativa_em timestamptz,
  provider_id text,                  -- id da mensagem no provedor (Resend)
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint emails_outbox_para_fmt check (para ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint emails_outbox_payload_objeto check (jsonb_typeof(payload) = 'object')
);
create index emails_outbox_due on public.emails_outbox (agendado_para) where status in ('agendado', 'processando');
create unique index emails_outbox_dedupe on public.emails_outbox (dedupe_chave) where dedupe_chave is not null;

create trigger trg_acessos_permitidos_atualizado_em before update on public.acessos_permitidos
  for each row execute function public.tocar_atualizado_em();
create trigger trg_emails_outbox_atualizado_em before update on public.emails_outbox
  for each row execute function public.tocar_atualizado_em();

alter table public.acessos_permitidos enable row level security;
alter table public.emails_outbox      enable row level security;

-- acessos_permitidos: so a api le/escreve. Sem DELETE (tabela de negocio: revogar e status).
grant select, insert, update on public.acessos_permitidos to whaviso_api;
create policy api_acessos_permitidos on public.acessos_permitidos for all to whaviso_api using (true) with check (true);

-- emails_outbox: api produz; o zap consome e so escreve as colunas de transporte (fronteira do outbox).
grant select, insert, update on public.emails_outbox to whaviso_api;
grant select on public.emails_outbox to whaviso_zap;
grant update (status, enviado_em, tentativas, proxima_tentativa_em, provider_id, erro)
  on public.emails_outbox to whaviso_zap;
create policy api_emails_outbox on public.emails_outbox for all to whaviso_api using (true) with check (true);
create policy zap_emails_outbox on public.emails_outbox for all to whaviso_zap  using (true) with check (true);

-- Semente anti-lockout: o dono do produto ja entra aprovado (senao o proprio gate o tranca).
-- Vai em MIGRATION (upsert) porque o seed nao roda no cloud.
insert into public.acessos_permitidos (email, status, origem, aprovado_em)
values ('jefferson.ferreira@olimpiapartners.com.br', 'aprovado', 'admin', now())
on conflict (lower(email)) do update set status = 'aprovado', aprovado_em = coalesce(public.acessos_permitidos.aprovado_em, now());
