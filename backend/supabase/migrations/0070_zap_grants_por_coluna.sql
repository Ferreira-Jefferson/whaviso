-- M4 (fronteira do outbox): restringe o UPDATE do whaviso_zap em `envios` e
-- `creditos_carteira` de "linha inteira" para SOMENTE as colunas que o zap realmente
-- escreve. Em `avisos` o cuidado ja existia (0008: grant update por coluna); aqui o mesmo
-- padrao chega ao resto do outbox / carteira.
--
-- Motivo: o zap e o CONSUMIDOR do outbox; a api e a PRODUTORA. Com grant de linha inteira o
-- zap poderia sobrescrever colunas que sao da api, atravessando a fronteira sem barreira:
--   - em envios: aviso_id, etapa, agendado_para, ocorrencia_id (o que a api agenda);
--   - em creditos_carteira: ja_comprou (regra de billing, dona a api).
-- A policy `for all using(true)` NAO concede colunas; o teto real e o GRANT, entao apertamos
-- o GRANT. O SELECT continua liberado: o zap le a linha e faz `select ... for update`, que em
-- Postgres exige UPDATE em AO MENOS uma coluna (as colunas concedidas abaixo cobrem isso).

-- ── envios ───────────────────────────────────────────────────────────────────
-- Colunas que o zap escreve (evidencia no codigo do zap, todas read-only conferidas):
--   status               enviar_lembretes/repo.ts (reivindicar/marcar*/reagendar) e webhook
--   enviado_em           enviar_lembretes/repo.ts marcarEnviado
--   wamid                enviar_lembretes/repo.ts marcarEnviado
--   erro                 enviar_lembretes/repo.ts (varios) e webhook_whatsapp/repo.ts
--   proxima_tentativa_em enviar_lembretes/repo.ts devolverAguardandoTemplate / reagendarOuFalhar
--   tentativas           enviar_lembretes/repo.ts marcarFalhou / reagendarOuFalhar
--   entrega_status       webhook_whatsapp/repo.ts atualizarEntrega
-- NAO escreve: id, aviso_id, etapa, agendado_para, ocorrencia_id, criado_em (dominio da api).
revoke update on public.envios from whaviso_zap;
grant update (status, enviado_em, wamid, erro, proxima_tentativa_em, tentativas, entrega_status)
  on public.envios to whaviso_zap;

-- ── creditos_carteira ─────────────────────────────────────────────────────────
-- Colunas que o zap movimenta (evidencia em shared/creditos/index.ts):
--   saldo_livre / reservado  devolverReservaNaoAceito, consumirNoDisparo
--   em_hold / reservado      reativarHold
--   em_hold / saldo_livre    processarHoldsVencidos
--   reservado / consumido    consumirNoDisparo
-- atualizado_em entra por seguranca: o trigger BEFORE UPDATE (trg_creditos_carteira_
-- atualizado_em) o toca; incluir aqui evita qualquer atrito de privilegio de coluna e o zap
-- so estaria marcando o proprio timestamp de frescor (nao e coluna de fronteira).
-- NAO escreve: profile_id (chave), ja_comprou (regra de billing, dona a api).
revoke update on public.creditos_carteira from whaviso_zap;
grant update (saldo_livre, reservado, em_hold, consumido, atualizado_em)
  on public.creditos_carteira to whaviso_zap;
