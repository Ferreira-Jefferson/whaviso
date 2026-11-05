-- Suporte com acesso assistido (decisao 2026-11-04, ver docs/pivot/PLANO-gestao-numeros-e-suporte.md).
--
-- O cliente (dono/gerente da loja) abre um CHAMADO de suporte e troca mensagens com a equipe whaviso.
-- Para que o operador veja o CONTEUDO da loja (ex.: conversas), o cliente CONCEDE um acesso assistido
-- temporario e revogavel (`acessos_suporte`): isso e a excecao controlada ao SEC-003 ("plataforma ve o
-- negocio, nao o conteudo"). Toda leitura de conteudo pelo operador durante a sessao assistida grava em
-- `acessos_suporte_log` (append-only). Sem consentimento ativo, o operador continua barrado do conteudo.
--
-- Fronteira: dono das tabelas e o modulo `suporte` (api). A ponte que autoriza o operador sob
-- consentimento vive no kernel shared/tenant (escopoLoja). Sem DELETE (SEC-030). Seed NAO roda no cloud.

-- ------------------------------------------------------------------------------------------------
-- Permissoes (console: ver/atender chamados e abrir sessao assistida; loja: abrir/conceder/revogar).
-- Molde 0072/0073; paridade DB x catalogo (chave/escopo/rotulo/ordem) conferida por teste.
-- ------------------------------------------------------------------------------------------------
insert into public.permissoes (chave, escopo, rotulo, ordem) values
  ('suporte_plataforma:ver', 'console', 'Ver chamados de suporte e acessos assistidos', 170),
  ('suporte_plataforma:atender', 'console', 'Responder chamados e abrir sessao de acesso assistido', 180),
  ('suporte_loja:gerir', 'loja', 'Abrir chamado de suporte e conceder ou revogar acesso assistido', 580)
on conflict (chave) do nothing;

with padrao(escopo, papel, chave) as (values
  ('console', 'suporte', 'suporte_plataforma:ver'),
  ('console', 'operador', 'suporte_plataforma:ver'),
  ('console', 'suporte', 'suporte_plataforma:atender'),
  ('console', 'operador', 'suporte_plataforma:atender'),
  ('loja', 'gerente', 'suporte_loja:gerir')
),
papeis(escopo, papel) as (values
  ('console', 'convidado'), ('console', 'suporte'), ('console', 'financeiro'), ('console', 'operador'), ('console', 'admin'),
  ('loja', 'convidado'), ('loja', 'atendente'), ('loja', 'gerente'), ('loja', 'dono')
)
insert into public.papel_permissoes (escopo, papel, permissao_chave, permitido)
select p.escopo, p.papel, pe.chave,
       (p.papel in ('admin', 'dono') or exists (
          select 1 from padrao d where d.escopo = p.escopo and d.papel = p.papel and d.chave = pe.chave))
  from papeis p
  join public.permissoes pe on pe.escopo = p.escopo
 where pe.chave in ('suporte_plataforma:ver', 'suporte_plataforma:atender', 'suporte_loja:gerir')
on conflict (escopo, papel, permissao_chave) do nothing;

-- ------------------------------------------------------------------------------------------------
-- Chamados de suporte (um por loja, com fio de mensagens entre loja e operador). Sem PII sensivel:
-- assunto/texto sao conteudo digitado pelo usuario (nao telefone/Pix/token), mas ainda assim a
-- redaction de log cobre o corpo das mensagens; aqui so persistimos o texto do chamado.
-- ------------------------------------------------------------------------------------------------
create type status_chamado as enum ('aberto', 'respondido', 'resolvido');

create table public.chamados_suporte (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  assunto text not null check (length(btrim(assunto)) between 1 and 160),
  status status_chamado not null default 'aberto',
  criado_por uuid not null,                     -- user_id do membro que abriu
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index chamados_suporte_loja on public.chamados_suporte (loja_id, criado_em desc);
create index chamados_suporte_status on public.chamados_suporte (status, atualizado_em desc);

create trigger trg_chamados_suporte_atualizado_em before update on public.chamados_suporte
  for each row execute function public.tocar_atualizado_em();

create table public.chamados_suporte_mensagens (
  id uuid primary key default gen_random_uuid(),
  chamado_id uuid not null references public.chamados_suporte (id) on delete cascade,
  autor_tipo text not null check (autor_tipo in ('loja', 'operador')),
  autor_user_id uuid not null,
  texto text not null check (length(btrim(texto)) between 1 and 4000),
  criado_em timestamptz not null default now()
);
create index chamados_suporte_mensagens_chamado on public.chamados_suporte_mensagens (chamado_id, criado_em);

-- ------------------------------------------------------------------------------------------------
-- Acesso assistido: consentimento temporario do cliente para o operador ver o conteudo da loja.
-- Ativo = revogado_em is null and now() < expira_em. O dono revoga a qualquer momento; auto-expira.
-- ------------------------------------------------------------------------------------------------
create table public.acessos_suporte (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  chamado_id uuid references public.chamados_suporte (id) on delete set null,
  concedido_por uuid not null,                  -- user_id do membro (dono/gerente) que concedeu
  motivo text check (motivo is null or length(btrim(motivo)) between 1 and 400),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  revogado_em timestamptz,
  revogado_por uuid,
  constraint acessos_suporte_expira_futuro check (expira_em > criado_em)
);
-- Lookup da ponte (escopoLoja): "ha acesso ativo para esta loja?" por loja_id + janela.
create index acessos_suporte_loja_ativo on public.acessos_suporte (loja_id, expira_em)
  where revogado_em is null;

-- Auditoria append-only de cada leitura de conteudo pelo operador na sessao assistida (SEC-003 excecao
-- rastreada). Sem PII: acao/recurso sao rotulos (ex.: 'conversas:listar', 'conversa:abrir'), nunca o
-- conteudo em si nem telefone.
create table public.acessos_suporte_log (
  id bigint generated always as identity primary key,
  acesso_id uuid references public.acessos_suporte (id) on delete set null,
  operador_user_id uuid not null,
  loja_id uuid not null references public.lojas (id) on delete cascade,
  acao text not null,
  recurso text,
  criado_em timestamptz not null default now()
);
create index acessos_suporte_log_loja on public.acessos_suporte_log (loja_id, criado_em desc);
create index acessos_suporte_log_acesso on public.acessos_suporte_log (acesso_id, criado_em);

-- ------------------------------------------------------------------------------------------------
-- Grants e RLS: so a api toca estas tabelas. Sem DELETE (SEC-030). Log e append-only (sem update).
-- ------------------------------------------------------------------------------------------------
alter table public.chamados_suporte enable row level security;
alter table public.chamados_suporte_mensagens enable row level security;
alter table public.acessos_suporte enable row level security;
alter table public.acessos_suporte_log enable row level security;

grant select, insert, update on public.chamados_suporte to whaviso_api;
grant select, insert on public.chamados_suporte_mensagens to whaviso_api;
grant select, insert, update on public.acessos_suporte to whaviso_api;
grant select, insert on public.acessos_suporte_log to whaviso_api;

create policy api_chamados_suporte on public.chamados_suporte
  for all to whaviso_api using (true) with check (true);
create policy api_chamados_suporte_mensagens on public.chamados_suporte_mensagens
  for all to whaviso_api using (true) with check (true);
create policy api_acessos_suporte on public.acessos_suporte
  for all to whaviso_api using (true) with check (true);
create policy api_acessos_suporte_log on public.acessos_suporte_log
  for all to whaviso_api using (true) with check (true);
