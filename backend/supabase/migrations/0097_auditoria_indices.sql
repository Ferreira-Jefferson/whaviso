-- Auditoria de SQL (2026-07-22, item 15): indices que faltavam em caminhos
-- quentes, achados lendo o codigo de fato (docs/feedback-2026-07-22.md).

-- P0: o check de idempotencia de consumo de credito roda a cada envio de
-- mensagem (consumirNoDisparo, backend/apps/zap/src/shared/creditos/index.ts)
-- e filtra por (ref_tipo, ref_id) no livro-razao append-only, que so cresce.
-- Sem indice, essa consulta varre a tabela inteira.
create index idx_creditos_lancamentos_ref
  on public.creditos_lancamentos (ref_tipo, ref_id);

-- P1: o drainer de lembretes (backend/apps/zap/src/modules/enviar_lembretes/repo.ts)
-- aplica o espacamento de 10min por devedor com um NOT EXISTS sobre
-- envios.enviado_em filtrado por status='enviado'. O mesmo padrao ja existe em
-- notificacoes_cobrador (idx_notif_cobrador_due, migration 0014); nunca foi
-- replicado em envios.
create index idx_envios_enviado_em
  on public.envios (enviado_em)
  where status = 'enviado';

-- P1: reativarHold (backend/apps/zap/src/shared/creditos/index.ts) consulta
-- creditos_hold por aviso_id com resolvido_em is null a cada clique em
-- "Ativar" (reativacao dentro da janela de 24h).
create index idx_creditos_hold_aviso_pendente
  on public.creditos_hold (aviso_id)
  where resolvido_em is null;
