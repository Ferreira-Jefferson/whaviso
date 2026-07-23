-- Auditoria de SQL (2026-07-22, item 15): grants de creditos_hold violavam
-- privilegio minimo (0057 concedeu select/insert/update para os dois roles
-- de largada, sem checar quem de fato usa cada operacao).
--
-- Conferido no codigo (nao assumido):
--   - whaviso_api so INSERE em creditos_hold: holdReserva, em
--     backend/apps/api/src/shared/planos/index.ts, so faz
--     `insert into public.creditos_hold (...)`. Nunca faz select nem update
--     nessa tabela.
--   - whaviso_zap so SELECIONA e ATUALIZA creditos_hold: reativarHold e
--     processarHoldsVencidos, em backend/apps/zap/src/shared/creditos/index.ts,
--     fazem `select ... from public.creditos_hold` e
--     `update public.creditos_hold set resolvido_em = ...`. Nunca insere
--     (quem cria a linha de hold e sempre a api, em holdReserva).
--
-- A policy RLS (api_creditos_hold / zap_creditos_hold, ambas "for all") nao
-- muda: RLS controla visibilidade de linha, nao substitui o grant de
-- privilegio da tabela.
revoke select, update on public.creditos_hold from whaviso_api;
revoke insert on public.creditos_hold from whaviso_zap;
