-- Item 7 (wave 2), correção de conceito (2026-07-24): nome (de quem paga) e motivo (do
-- combinado) são dados DIFERENTES; agrupá-los num único campo 'nome_motivo' (0093)
-- misturava dois conceitos. Separa cada um em seu próprio valor de `campo`.
--
-- Tabela `avisos_reportes` sem nenhuma linha em produção até aqui (feature recém-lançada,
-- ainda sem reporte real registrado): troca de CHECK sem necessidade de migrar dado.
--
-- Numeração: última migration = 0101 (notificacoes_central); esta é 0102.

alter table public.avisos_reportes drop constraint avisos_reportes_campo_check;
alter table public.avisos_reportes add constraint avisos_reportes_campo_check
  check (campo in ('valor', 'data', 'nome', 'motivo'));
