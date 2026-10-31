-- Credenciais de plataforma (nao sao da loja, nao sao do restaurante): numero oficial do
-- whaviso no WhatsApp (hoje so META_ACCESS_TOKEN/META_PHONE_NUMBER_ID/META_WABA_ID em .env,
-- exigidos no boot do zap mas sem nenhum consumidor real ainda) e a chave do Resend (e-mail
-- transacional, hoje ZAP_RESEND_API_KEY em .env, ja consumida pelo dreno de e-mail).
--
-- Mesmo molde de config_plataforma (0084): singleton (id fixo), semeado por esta migration,
-- a api so faz UPDATE. Diferente de config_plataforma (que e preco, publico), aqui os campos
-- de credencial SAO segredo (cifrados, nunca em claro/log). zap e quem decifra (precisa usar
-- as credenciais para enviar); a api so escreve (write-only sobre as colunas cifradas, SEC-021/022).
-- Sem DELETE (SEC-030): credencial se sobrescreve, nunca some.

create table public.credenciais_whatsapp_oficial (
  id smallint primary key default 1,
  phone_number_id text,
  waba_id text,
  access_token_cifrado bytea,
  atualizado_em timestamptz not null default now(),
  constraint credenciais_whatsapp_oficial_singleton check (id = 1)
);

create trigger trg_credenciais_whatsapp_oficial_atualizado_em
  before update on public.credenciais_whatsapp_oficial
  for each row execute function public.tocar_atualizado_em();

alter table public.credenciais_whatsapp_oficial enable row level security;
-- api: escreve (set/rotate) e le os metadados (phone_number_id/waba_id/atualizado_em); por
-- convencao de codigo nunca seleciona access_token_cifrado de volta (so grava). zap: so leitura,
-- precisa decifrar o token para usar o numero oficial.
grant select, update on public.credenciais_whatsapp_oficial to whaviso_api;
grant select on public.credenciais_whatsapp_oficial to whaviso_zap;
create policy api_credenciais_whatsapp_oficial on public.credenciais_whatsapp_oficial
  for all to whaviso_api using (true) with check (true);
create policy zap_credenciais_whatsapp_oficial on public.credenciais_whatsapp_oficial
  for select to whaviso_zap using (true);

insert into public.credenciais_whatsapp_oficial (id) values (1) on conflict (id) do nothing;

create table public.credenciais_email_plataforma (
  id smallint primary key default 1,
  remetente text,
  api_key_cifrada bytea,
  atualizado_em timestamptz not null default now(),
  constraint credenciais_email_plataforma_singleton check (id = 1)
);

create trigger trg_credenciais_email_plataforma_atualizado_em
  before update on public.credenciais_email_plataforma
  for each row execute function public.tocar_atualizado_em();

alter table public.credenciais_email_plataforma enable row level security;
grant select, update on public.credenciais_email_plataforma to whaviso_api;
grant select on public.credenciais_email_plataforma to whaviso_zap;
create policy api_credenciais_email_plataforma on public.credenciais_email_plataforma
  for all to whaviso_api using (true) with check (true);
create policy zap_credenciais_email_plataforma on public.credenciais_email_plataforma
  for select to whaviso_zap using (true);

insert into public.credenciais_email_plataforma (id) values (1) on conflict (id) do nothing;
