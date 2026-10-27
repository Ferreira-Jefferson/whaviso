-- Auditoria e conhecimento.
--
-- eventos:      trilha append-only genérica, SEM PII (nada de telefone, Pix, token, nome ou texto
--               de mensagem em `detalhes`).
-- eventos_auth: auditoria de autenticação, append-only; telefone só como sha256.
-- base_conhecimento + cache_semantico: RAG com pgvector. Dados sempre-ao-vivo (preço,
--               disponibilidade, status de pedido) NUNCA saem do cache: a regra é da aplicação.
--
-- Sem DELETE de auditoria. As referências a lojas não têm cascata, para a trilha sobreviver.

create type ator_evento as enum ('loja', 'cliente', 'sistema', 'ia', 'operador');

create type tipo_evento_auth as enum (
  'status_consultado',     -- consulta de status de telefone (vigiar enumeração)
  'otp_solicitado',        -- hook de login recebeu um OTP para entregar
  'otp_entregue',          -- OTP entregue pelo WhatsApp
  'otp_falha_envio',       -- falha ao entregar o OTP (motivo, sem PII)
  'login_negado',
  'cadastro_negado',
  'login_ok',
  'cadastro_ok'
);

create table public.eventos (
  id bigint generated always as identity primary key,
  loja_id uuid references public.lojas (id),
  tipo text not null,                           -- ex.: pedido.status_alterado, conversa.handoff
  entidade text,                                -- ex.: pedido, conversa, template
  entidade_id uuid,
  ator ator_evento not null,
  detalhes jsonb,                               -- sem PII
  criado_em timestamptz not null default now()
);
create index eventos_loja on public.eventos (loja_id, criado_em);
create index eventos_entidade on public.eventos (entidade, entidade_id, criado_em);
create index eventos_tipo on public.eventos (tipo, criado_em);

create table public.eventos_auth (
  id bigint generated always as identity primary key,
  tipo tipo_evento_auth not null,
  telefone_hash text,                           -- sha256 hex (nem todo evento tem telefone)
  detalhes jsonb,                               -- sem PII (motivo, flags)
  criado_em timestamptz not null default now(),
  constraint eventos_auth_hash_fmt check (telefone_hash is null or telefone_hash ~ '^[0-9a-f]{64}$')
);
create index eventos_auth_tel on public.eventos_auth (telefone_hash, criado_em);
create index eventos_auth_tipo on public.eventos_auth (tipo, criado_em);

create trigger trg_eventos_imutavel before update on public.eventos
  for each row execute function public.rejeitar_update_append_only();
create trigger trg_eventos_auth_imutavel before update on public.eventos_auth
  for each row execute function public.rejeitar_update_append_only();

create table public.base_conhecimento (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  titulo text not null,
  conteudo text not null,
  origem text not null default 'manual',        -- manual | retroalimentada
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index base_conhecimento_loja on public.base_conhecimento (loja_id) where ativo;

create table public.cache_semantico (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  pergunta text not null,
  resposta text not null,
  acertos integer not null default 0,
  expira_em timestamptz not null,
  criado_em timestamptz not null default now()
);
create index cache_semantico_loja on public.cache_semantico (loja_id, expira_em);

-- Coluna de embedding e índices vetoriais só existem quando a extensão vector está instalada.
-- Dimensão 1536 (padrão dos modelos de embedding comuns); trocar de modelo = nova coluna.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    alter table public.base_conhecimento add column embedding vector(1536);
    alter table public.cache_semantico   add column embedding vector(1536);
    create index base_conhecimento_embedding on public.base_conhecimento
      using hnsw (embedding vector_cosine_ops);
    create index cache_semantico_embedding on public.cache_semantico
      using hnsw (embedding vector_cosine_ops);
  else
    raise notice 'vector ausente: embedding nao criado em base_conhecimento/cache_semantico';
  end if;
end
$$;

create trigger trg_base_conhecimento_atualizado_em before update on public.base_conhecimento
  for each row execute function public.tocar_atualizado_em();

alter table public.eventos            enable row level security;
alter table public.eventos_auth       enable row level security;
alter table public.base_conhecimento  enable row level security;
alter table public.cache_semantico    enable row level security;

-- Auditoria: só select + insert para quem escreve; zero UPDATE/DELETE.
grant select, insert on public.eventos to whaviso_api, whaviso_zap, whaviso_atendente;
grant select, insert on public.eventos_auth to whaviso_api, whaviso_zap;

-- Conhecimento: a api administra (painel); o atendente consulta e retroalimenta.
grant select, insert, update on public.base_conhecimento to whaviso_api, whaviso_atendente;
-- Cache não é negócio nem auditoria: o atendente também expurga o que expirou.
grant select, insert, update, delete on public.cache_semantico to whaviso_atendente;
grant select on public.cache_semantico to whaviso_api;

create policy api_eventos       on public.eventos for all to whaviso_api       using (true) with check (true);
create policy zap_eventos       on public.eventos for all to whaviso_zap       using (true) with check (true);
create policy atendente_eventos on public.eventos for all to whaviso_atendente using (true) with check (true);

create policy api_eventos_auth on public.eventos_auth for all to whaviso_api using (true) with check (true);
create policy zap_eventos_auth on public.eventos_auth for all to whaviso_zap using (true) with check (true);

create policy api_base_conhecimento       on public.base_conhecimento for all to whaviso_api       using (true) with check (true);
create policy atendente_base_conhecimento on public.base_conhecimento for all to whaviso_atendente using (true) with check (true);
create policy api_cache_semantico         on public.cache_semantico   for select to whaviso_api    using (true);
create policy atendente_cache_semantico   on public.cache_semantico   for all to whaviso_atendente using (true) with check (true);
