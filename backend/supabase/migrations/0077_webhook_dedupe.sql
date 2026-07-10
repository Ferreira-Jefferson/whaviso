-- Idempotência de reentrega do webhook da Meta (inbound de botões/texto do devedor).
--
-- Motivo: o POST /webhook/whatsapp responde 200 IMEDIATO e processa em background
-- (meta_client: valida assinatura -> 200 -> processarWebhook). A Meta REENTREGA o mesmo
-- evento quando não vê o 200 a tempo, inclusive em paralelo. A maioria das ações já é
-- idempotente por estado (aplicarAcaoBotao), MAS a entrega da chave Pix (ver_pix) tem uma
-- corrida read-then-write: duas reentregas simultâneas leem entrega_chave_status != 'entregue'
-- e AMBAS mandam a chave. Esta tabela dá o teto at-most-once por evento: o webhook_whatsapp
-- REIVINDICA o wamid (INSERT ... ON CONFLICT DO NOTHING) antes de processar; se já existia,
-- ignora o evento.
--
-- Só o zap escreve/lê (é o consumidor do inbound); a api não toca. Sem DELETE (coerente com
-- a regra de não deletar dado de negócio/auditoria); a limpeza/retenção de linhas antigas,
-- se vier a ser necessária, fica para uma rotina de manutenção dedicada.
create table public.webhook_eventos_processados (
  wamid text primary key,                              -- id da mensagem inbound da Meta (Meta `messages[].id`)
  processado_em timestamptz not null default now()
);

-- Grants: o zap reivindica (insert) e confere (select). Sem update/delete: a linha é um
-- marcador imutável de "já vi este evento".
grant select, insert on public.webhook_eventos_processados to whaviso_zap;

-- RLS deny-all para anon/authenticated; policy só para o role de serviço (o grant acima é
-- que limita de fato os comandos). Mesmo padrão das demais tabelas de serviço (0065).
alter table public.webhook_eventos_processados enable row level security;
create policy zap_webhook_dedupe on public.webhook_eventos_processados
  for all to whaviso_zap using (true) with check (true);
