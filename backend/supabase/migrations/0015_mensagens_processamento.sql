-- Estado de processamento do inbound pelo atendente (AT-motor-min).
--
-- O webhook do zap (ZAP-webhook) persiste a mensagem de ENTRADA em `mensagens` e emite
-- `conversa.mensagem`, mas nao marca claim: o atendente e quem reivindica e conduz o turno.
-- Esta migration adiciona a marca de processamento e o indice parcial do claim, no mesmo
-- padrao do dreno de `envios` do zap (FOR UPDATE SKIP LOCKED sobre um indice parcial de "due").
--
-- `processada_em` NULL = ainda nao processada pelo atendente; preenchida = turno ja rodou (a
-- reentrega/replay nao reprocessa). O atendente ganha UPDATE SO nesta coluna (privilegio minimo,
-- SEC-032); SELECT ja tinha (0006). Sem DELETE: `mensagens` segue registro imutavel.

alter table public.mensagens add column processada_em timestamptz;

-- Indice do claim do atendente: so as mensagens de entrada ainda pendentes. Ordena por criado_em
-- (processa em ordem de chegada). Espelha `envios_due` do outbox.
--
-- O claim de PRODUCAO e GLOBAL (`order by criado_em ... limit 1`), servido por este indice. O motor
-- aceita, opcionalmente, restringir o claim a uma conversa (drain direcionado/testes): esse filtro
-- `conversa_id` roda sobre o MESMO conjunto parcial (as entradas pendentes, poucas por desenho, pois
-- sao drenadas a cada tick), sem indice proprio. Nao incluimos conversa_id no indice de proposito:
-- `(conversa_id, criado_em)` prejudicaria a ordenacao global por criado_em do caminho quente.
create index mensagens_inbound_pendente on public.mensagens (criado_em)
  where direcao = 'entrada' and processada_em is null;

-- O atendente reivindica (select ... for update skip locked) e marca processada_em. O FOR UPDATE
-- exige UPDATE em ao menos uma coluna; conceder so `processada_em` cobre o claim sem abrir o resto
-- da linha (conteudo/wamid continuam imutaveis para o atendente). A policy atendente_mensagens
-- (0006, `for all`) ja autoriza; aqui so o GRANT de coluna fecha o teto de privilegio.
grant update (processada_em) on public.mensagens to whaviso_atendente;
