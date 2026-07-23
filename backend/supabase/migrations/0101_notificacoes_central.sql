-- Central de notificações (item 6, feedback 2026-07-22): a leva anterior (grupo 1F,
-- docs/planos/2026-07-22-1f-zap-notificacoes-lembretes.md) já confirmou o ENFILEIRAMENTO
-- das 4 categorias do item ("pagamento reportado" é o mesmo evento de "pagamento
-- informado", H10.10): `notificacoes_cobrador` (pagamento_informado, combinado_dado_incorreto)
-- e `notificacoes_billing` (solicitação de créditos), mas deliberadamente deixou de fora a
-- LEITURA (endpoint + UI), por faltar a decisão de mecanismo de "lida". Esta migration
-- fecha essa decisão: coluna `lida_em` (NULL = não lida) em cada outbox, o jeito mais
-- simples que cobre o caso de uso (abrir o sino marca tudo como lido).
--
-- Numeração: última migration = 0100 (dado_incorreto_zap); esta é 0101.

-- 1) Coluna de leitura em cada outbox. NULL = não lida (default); marcada com now() quando
--    o usuário abre a central. Nunca DELETE (mesma regra das duas tabelas, são outbox/
--    auditoria); "lida" é só um carimbo, não muda o rastro de envio/retry.
alter table public.notificacoes_cobrador add column if not exists lida_em timestamptz;
alter table public.notificacoes_billing  add column if not exists lida_em timestamptz;

-- 2) Grants: whaviso_api já tem UPDATE em notificacoes_cobrador desde a 0042 (coalescing de
--    encerramento/H8.6); falta só em notificacoes_billing, onde a api hoje só SELECT+INSERT
--    (0060, o zap é quem atualiza status de envio). Marcar como lida é uma ação do USUÁRIO
--    pela api, não do drainer; escopo mínimo, sem abrir mais privilégio que isso.
grant update on public.notificacoes_billing to whaviso_api;

-- 3) Índices de suporte à consulta da central (GET /v1/notificacoes): por dono (alvo) +
--    ordem cronológica. Parcial em notificacoes_cobrador (só as categorias do item 6; os
--    demais TipoNotificacao não entram na central nesta leva, ver H10.10).
create index if not exists idx_notif_cobrador_central
  on public.notificacoes_cobrador (cobrador_id, criado_em desc)
  where cobrador_id is not null
    and tipo in ('pagamento_informado', 'combinado_dado_incorreto');

create index if not exists idx_notif_billing_central
  on public.notificacoes_billing (profile_id, criado_em desc);
