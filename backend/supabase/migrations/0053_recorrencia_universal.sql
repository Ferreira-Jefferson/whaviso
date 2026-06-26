-- 0053: Recorrência é FACILITADOR, não diferencial de plano (E11 H11.5, decisão 2026-06-25).
--
-- Envio recorrente não é vendido por plano nem gated atrás de upgrade: é só um atalho para
-- registrar de uma vez vários avisos do mesmo cliente. O que limita é o CUSTO POR OCORRÊNCIA
-- (cada ocorrência reserva 1 vaga de aviso ativo, ver 0052) e a regra geral do free (monta na
-- agenda, mas não envia). Por isso `permite_recorrente` deixa de ser porteiro e passa a `true`
-- em TODOS os planos (a coluna permanece, agora significando "o recurso existe", não "é pago").
--
-- NÃO mexe em nenhuma outra alavanca. A função `alavancas_do_plano` (0033) já expõe a coluna;
-- nada a recriar. Cadência configurável (`cadencia_configuravel`) CONTINUA diferencial pago.
--
-- Numeração: última migration = 0052; esta é 0053.

update public.planos set permite_recorrente = true;

comment on column public.planos.permite_recorrente is
  'E11/H11.5: recorrência é facilitador (não diferencial); true em todos os planos. O limite real é a vaga por ocorrência (0052) + a regra do free (agenda sim, envio não).';
