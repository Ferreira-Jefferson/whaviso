-- Mini-chat de teste do WhatsApp (Baileys). Ferramenta de DIAGNÓSTICO do owner:
-- enviar mensagens de texto para um número de teste e ver as respostas, sem passar
-- pela renderização de template/agendamento do ciclo (que é amarrada a um aviso). A
-- api ENFILEIRA a saída; o zap DRENA pela mesma fila/scheduler/transporte Baileys das
-- automáticas. Sandbox: o inbound do número de teste NÃO entra na máquina de estados
-- de convite/devedor (o webhook_whatsapp ignora esse número).

-- Número de teste configurado (1 linha, id=1). O owner cadastra/edita pelo painel.
create table public.whats_teste_config (
  id smallint primary key default 1,
  telefone text,                 -- E.164 (+55...) ou null quando não cadastrado
  atualizado_em timestamptz not null default now(),
  constraint whats_teste_config_unica check (id = 1)
);

insert into public.whats_teste_config (id) values (1) on conflict (id) do nothing;

-- Mensagens do mini-chat: 'saida' enfileirada pela api + 'entrada' gravada pelo zap.
create table public.whats_teste_mensagens (
  id uuid primary key default gen_random_uuid(),
  direcao text not null check (direcao in ('saida', 'entrada')),
  telefone text not null,        -- E.164 do número de teste
  texto text not null,
  status text not null default 'agendado'
    check (status in ('agendado', 'processando', 'enviado', 'falhou', 'recebido')),
  wamid text,
  erro text,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);

-- Drain: pega as 'saida' agendadas em ordem de chegada (claim FOR UPDATE SKIP LOCKED).
create index idx_whats_teste_drain on public.whats_teste_mensagens (criado_em)
  where direcao = 'saida' and status = 'agendado';
-- Histórico do chat: leitura por recência.
create index idx_whats_teste_hist on public.whats_teste_mensagens (criado_em desc);

-- Grants: a api enfileira saída + lê histórico + edita o número; o zap drena a saída
-- (claim/update) e grava a entrada (insert). Sem DELETE (dado de teste; limpar o
-- histórico, se preciso, vira ação dedicada com guarda na api, como em templates).
grant select, insert on public.whats_teste_mensagens to whaviso_api;
grant select, insert, update on public.whats_teste_mensagens to whaviso_zap;
grant select, insert, update on public.whats_teste_config to whaviso_api;
grant select on public.whats_teste_config to whaviso_zap;

-- RLS deny-all para anon/authenticated; policies só para os roles de serviço (os grants
-- acima é que limitam de fato quais comandos cada role pode rodar).
alter table public.whats_teste_mensagens enable row level security;
alter table public.whats_teste_config enable row level security;
create policy api_whats_teste_msg on public.whats_teste_mensagens for all to whaviso_api using (true) with check (true);
create policy zap_whats_teste_msg on public.whats_teste_mensagens for all to whaviso_zap using (true) with check (true);
create policy api_whats_teste_cfg on public.whats_teste_config for all to whaviso_api using (true) with check (true);
create policy zap_whats_teste_cfg on public.whats_teste_config for select to whaviso_zap using (true);
