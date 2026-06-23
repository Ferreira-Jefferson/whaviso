-- Aviso ao COBRADOR quando o devedor informa que pagou (status → informado_pago).
-- Arquitetura: a `api` não fala com a Meta; ela só enfileira nesta outbox; o `zap`
-- drena (FOR UPDATE SKIP LOCKED) e envia o template ao WhatsApp do cobrador.
-- GATED: enquanto não houver template aprovado+ativo em templates_cobrador, o zap
-- não drena (as linhas ficam 'agendado' aguardando a aprovação da Meta).

-- Espelho versionado do template de notificação ao cobrador (aprovado na Meta).
create table public.templates_cobrador (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  nome_meta text not null,
  idioma text not null default 'pt_BR',
  corpo text not null,
  variaveis jsonb not null default '[]'::jsonb,
  status_meta status_meta_template not null default 'pendente',
  ativo boolean not null default false,
  criado_em timestamptz not null default now(),
  -- Regra de ouro nº1: nenhum vocabulário proibido (mesmo padrão de templates_mensagem).
  constraint templates_cobrador_linguagem_limpa
    check (corpo !~* '(d[ií]vida|devendo|atras(o|ad)|cobran[çc]a|inadimpl)')
);
create unique index idx_templates_cobrador_ativo on public.templates_cobrador (tipo) where ativo;
create unique index idx_templates_cobrador_nome on public.templates_cobrador (nome_meta);

-- Outbox das notificações ao cobrador (reusa status_envio: agendado/processando/...).
create table public.notificacoes_cobrador (
  id uuid primary key default gen_random_uuid(),
  aviso_id uuid not null references public.avisos (id) on delete cascade,
  cobrador_id uuid not null references public.profiles (id) on delete cascade,
  tipo text not null default 'pagamento_informado',
  status status_envio not null default 'agendado',
  tentativas smallint not null default 0,
  proxima_tentativa_em timestamptz,
  wamid text,
  erro text,
  criado_em timestamptz not null default now()
);
-- Índice do claim do drainer (só linhas que ainda podem ser enviadas).
create index idx_notif_cobrador_due on public.notificacoes_cobrador (criado_em)
  where status in ('agendado', 'processando');

-- Grants (padrão da 0008: sem DELETE em nada).
grant select, insert, update on public.templates_cobrador to whaviso_api;
grant select on public.templates_cobrador to whaviso_zap;
grant select, insert on public.notificacoes_cobrador to whaviso_api;
-- zap também enfileira (no webhook do botão "Já paguei") e drena (claim/update).
grant select, insert, update on public.notificacoes_cobrador to whaviso_zap;

-- RLS deny-all para anon/authenticated; policies só para os roles de serviço.
alter table public.templates_cobrador     enable row level security;
alter table public.notificacoes_cobrador  enable row level security;

create policy api_templates_cobrador on public.templates_cobrador for all to whaviso_api using (true) with check (true);
create policy zap_templates_cobrador on public.templates_cobrador for select to whaviso_zap using (true);
create policy api_notif_cobrador on public.notificacoes_cobrador for all to whaviso_api using (true) with check (true);
create policy zap_notif_cobrador on public.notificacoes_cobrador for all to whaviso_zap using (true) with check (true);
