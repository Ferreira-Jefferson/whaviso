-- Outbox DEDICADA da mensagem de compra de crédito (recarga), empurrada ao WhatsApp do
-- próprio usuário. Arquitetura igual ao resto: a `api` só ENFILEIRA (quando o usuário
-- confirma a recarga na tela de Créditos); o `zap` DRENA (FOR UPDATE SKIP LOCKED),
-- monta a mensagem (template billing.recarga + chave Pix de config_plataforma) e envia.
-- api e zap nunca se importam: coordenam só por esta tabela.
--
-- Por que uma tabela NOVA e não reusar notificacoes_cobrador: aquela é AVISO-CÊNTRICA
-- (aviso_id NOT NULL, dedupe por aviso, espaçamento de 10min, INNER JOIN em avisos no
-- render). Uma recarga não tem combinado; estender poluiria a lógica de um fluxo
-- crítico. Esta outbox é mínima e reusa só o enum status_envio (0014) e o render
-- genérico do zap (carregarTemplateAtivo + renderMensagem).
--
-- A chave Pix NÃO é gravada aqui (menos superfície de PII): o zap lê config_plataforma
-- no momento do envio, então o recibo sai sempre com a chave vigente.
--
-- Numeração: última migration = 0059 (config_plataforma); esta é a 0060.

create table public.notificacoes_billing (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  telefone_alvo text not null,           -- E.164; snapshot do telefone na recarga. NUNCA logado.
  quantidade integer not null,           -- envios da recarga
  valor_centavos integer not null,       -- total calculado pela curva (espelho do servidor)
  status status_envio not null default 'agendado',   -- reusa o enum existente (0014)
  tentativas smallint not null default 0,
  proxima_tentativa_em timestamptz,
  enviado_em timestamptz,
  wamid text,
  erro text,
  criado_em timestamptz not null default now(),
  constraint notif_billing_telefone_e164 check (telefone_alvo ~ '^\+[1-9][0-9]{9,14}$'),
  constraint notif_billing_qtd_positiva check (quantidade > 0),
  constraint notif_billing_valor_nao_negativo check (valor_centavos >= 0)
);

-- Índice do claim do drainer (só linhas que ainda podem ser enviadas), padrão da 0014.
create index idx_notif_billing_due on public.notificacoes_billing (criado_em)
  where status in ('agendado', 'processando');

-- Grants (padrão 0008/0014, sem DELETE). api SÓ enfileira (a única produtora);
-- zap SÓ drena (claim/update). Diferente de notificacoes_cobrador, o zap NÃO insere aqui.
grant select, insert on public.notificacoes_billing to whaviso_api;
grant select, update on public.notificacoes_billing to whaviso_zap;

-- RLS deny-all para anon/authenticated; policies só para os roles de serviço.
alter table public.notificacoes_billing enable row level security;
create policy api_notif_billing on public.notificacoes_billing for all to whaviso_api using (true) with check (true);
create policy zap_notif_billing on public.notificacoes_billing for all to whaviso_zap using (true) with check (true);
