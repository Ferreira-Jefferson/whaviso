-- Épico 1 (Conta & Autenticação): trilha de auditoria de AUTENTICAÇÃO, append-only.
--
-- Por que uma tabela separada de `eventos_aviso`: aquela é POR aviso (FK aviso_id);
-- os eventos de login/cadastro NÃO têm aviso (são por telefone/conta). Não dá para
-- reusar sem furar a FK. Esta tabela registra o que o épico pede gravar (H1.2 "Negar
-- acesso registrado", H1.3 "Não fui eu registrado") e o que ajuda a observar abuso
-- (status de telefone consultado, OTP entregue), SEMPRE sem PII em claro.
--
-- Regras de ouro respeitadas:
--   * telefone NUNCA em claro: só o sha256 (coluna telefone_hash). Igual ao padrão de
--     tokens (claro nunca persiste). Assim a tabela serve para auditoria/contagem por
--     número (mesmo hash = mesmo número) sem expor o número.
--   * append-only: trigger rejeita UPDATE; nenhum role recebe DELETE (sem DELETE de
--     auditoria). Mesmo desenho de `eventos_aviso` (0005).
--   * sem travessão, sem palavras proibidas, gênero neutro (texto interno/código).

-- 1. Catálogo de tipos de evento de auth. Enum próprio (não reusa tipo_evento, que é
--    do ciclo do aviso). Valores cobrem login/cadastro (negado/ok) + sinais de
--    observabilidade (status consultado, OTP solicitado/entregue/falho).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_evento_auth') then
    create type tipo_evento_auth as enum (
      'status_consultado',   -- POST /v1/auth/status-telefone (enumeração: vigiar abuso)
      'otp_solicitado',      -- Send SMS Hook recebeu um OTP para entregar
      'otp_entregue',        -- OTP entregue pelo WhatsApp (Baileys) com sucesso
      'otp_falha_envio',     -- falha ao entregar o OTP (motivo, sem PII)
      'login_negado',        -- usuário recusou o acesso (H1.2 "Negar acesso")
      'cadastro_negado',     -- usuário recusou o cadastro (H1.3 "Não fui eu")
      'login_ok',            -- acesso confirmado (reservado; OTP confirma no Supabase)
      'cadastro_ok',         -- cadastro confirmado (reservado)
      'conta_criada_no_aceite' -- H1.4: conta nasceu por baixo dos panos no aceite
    );
  end if;
end
$$;

-- 2. Tabela append-only. `telefone_hash` é o sha256 hex do telefone E.164 (nunca o
--    número). `detalhes` é jsonb LIVRE de PII (motivo, flags), nunca telefone/código.
create table if not exists public.eventos_auth (
  id bigint generated always as identity primary key,
  tipo tipo_evento_auth not null,
  telefone_hash text,            -- sha256 hex (nullable: nem todo evento tem telefone)
  detalhes jsonb,                -- sem PII (motivo, existe:bool, etc.)
  criado_em timestamptz not null default now(),
  constraint eventos_auth_hash_fmt check (telefone_hash is null or telefone_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists idx_eventos_auth_tel on public.eventos_auth (telefone_hash, criado_em);
create index if not exists idx_eventos_auth_tipo on public.eventos_auth (tipo, criado_em);

-- 3. Imutável (append-only): rejeita UPDATE, igual a eventos_aviso. DELETE não é
--    concedido a nenhum role de serviço (defesa por privilégio); sem DELETE de auditoria.
create or replace function public.rejeitar_update_evento_auth()
returns trigger
language plpgsql
as $$
begin
  raise exception 'eventos_auth e imutavel (append-only)'
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists trg_eventos_auth_imutavel on public.eventos_auth;
create trigger trg_eventos_auth_imutavel
  before update on public.eventos_auth
  for each row execute function public.rejeitar_update_evento_auth();

-- 4. RLS + grants. Tanto a api (status-telefone, conta-no-aceite) quanto o zap
--    (hook_otp) escrevem. Ninguém recebe UPDATE/DELETE (append-only). Sem policy
--    para anon/authenticated => PostgREST nega tudo.
alter table public.eventos_auth enable row level security;

grant select, insert on public.eventos_auth to whaviso_api, whaviso_zap;

drop policy if exists api_eventos_auth on public.eventos_auth;
create policy api_eventos_auth on public.eventos_auth for all to whaviso_api using (true) with check (true);
drop policy if exists zap_eventos_auth on public.eventos_auth;
create policy zap_eventos_auth on public.eventos_auth for all to whaviso_zap using (true) with check (true);
