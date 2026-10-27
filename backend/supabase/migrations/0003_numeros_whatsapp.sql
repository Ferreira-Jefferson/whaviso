-- Números WhatsApp da loja (Meta Cloud API, Embedded Signup). O phone_number_id roteia o inbound
-- para a loja certa. O token fica cifrado (a cifra é da aplicação) e o número só como sha256.

create type status_numero as enum ('conectado', 'pausado', 'removido');

create table public.numeros_whatsapp (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  phone_number_id text not null,     -- id Meta, roteia o inbound
  waba_id text not null,
  numero_hash text,                  -- sha256, nunca o número em claro
  token_cifrado bytea,               -- token do Embedded Signup, criptografado
  status status_numero not null default 'conectado',
  verificado boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint numeros_hash_fmt check (numero_hash is null or numero_hash ~ '^[0-9a-f]{64}$')
);
create unique index numeros_phone_number_id on public.numeros_whatsapp (phone_number_id);
create index numeros_loja on public.numeros_whatsapp (loja_id);

create trigger trg_numeros_atualizado_em before update on public.numeros_whatsapp
  for each row execute function public.tocar_atualizado_em();

alter table public.numeros_whatsapp enable row level security;

-- api: dona do cadastro (conexão, token). zap: lê tudo (precisa do token para enviar) e só
-- escreve o estado de saúde da conexão. atendente: NUNCA vê credencial (grant por coluna).
grant select, insert, update on public.numeros_whatsapp to whaviso_api;
grant select on public.numeros_whatsapp to whaviso_zap;
grant update (status, verificado) on public.numeros_whatsapp to whaviso_zap;
grant select (id, loja_id, phone_number_id, status, verificado, criado_em)
  on public.numeros_whatsapp to whaviso_atendente;

create policy api_numeros       on public.numeros_whatsapp for all    to whaviso_api       using (true) with check (true);
create policy zap_numeros       on public.numeros_whatsapp for all    to whaviso_zap       using (true) with check (true);
create policy atendente_numeros on public.numeros_whatsapp for select to whaviso_atendente using (true);
