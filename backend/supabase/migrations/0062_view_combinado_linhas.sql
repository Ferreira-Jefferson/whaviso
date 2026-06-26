-- ---------------------------------------------------------------------------------------
-- E9 H9.6: VIEW de projecao "uma linha por ocorrencia" para o filtro por periodo do
-- painel (totais H9.2 + lista H9.1/H9.3). O painel unificado (/app) passa a reger totais
-- E lista por um unico periodo (de/ate); quando ha periodo, um combinado recorrente vira
-- uma linha por ocorrencia (data/status proprios), e os totais somam por ocorrencia.
--
-- Regra de estado (decidida com o produto, registrada em historias/09-painel.md H9.6):
--   "Estado global do combinado manda nas ocorrencias futuras ainda nao pagas."
--   - ocorrencia ja avancada (informado_pago/pago): mantem o proprio status;
--   - ocorrencia ainda 'programado' de combinado em estado GLOBAL (sem_aviso,
--     aguardando_aceite, pausado, aguardando_aprovacao_aviso_editado, desregistrado,
--     cancelado, recusado, expirado): herda o estado do combinado (pausar/cancelar
--     reflete nas parcelas futuras);
--   - caso contrario (combinado no ciclo normal programado/informado_pago/pago): a
--     ocorrencia 'programado' fica 'programado' (o informado_pago/pago da ocorrencia
--     CORRENTE nao contamina as futuras).
--
-- security_invoker = true: a view roda com os privilegios e o RLS do papel que consulta
-- (whaviso_api), igual a consultar as tabelas direto. O valor (valor_centavos) e por
-- COMBINADO: toda ocorrencia herda avisos.valor_centavos (nao ha valor por ocorrencia).
-- A view NAO colapsa recorrente sem periodo: o caminho "sem periodo" segue lendo
-- public.avisos (uma linha por combinado); a view e usada so quando ha de/ate.
-- ---------------------------------------------------------------------------------------

create or replace view public.combinado_linhas
with (security_invoker = true) as
-- 1) Combinado SIMPLES (sem recorrencia): a propria linha do aviso.
select
  a.id as aviso_id,
  a.cobrador_id, a.devedor_profile_id, a.direcao, a.criador_papel,
  a.nome_devedor, a.telefone_devedor, a.nome_cobrador, a.telefone_cobrador,
  a.motivo, a.pix_chave, a.pix_titular, a.pix_banco,
  a.recorrencia_tipo, a.recorrencia_freq, a.recorrencia_intervalo,
  a.ocorrencias_total, a.cadencia_etapas,
  a.aceito_em, a.arquivado_em, a.criado_em, a.atualizado_em,
  1 as indice,
  a.data_combinada as linha_data,
  a.valor_centavos as linha_valor,
  a.status as linha_status
from public.avisos a
where a.recorrencia_tipo is null

union all

-- 2) Combinado RECORRENTE com ocorrencias: uma linha por ocorrencia.
select
  a.id as aviso_id,
  a.cobrador_id, a.devedor_profile_id, a.direcao, a.criador_papel,
  a.nome_devedor, a.telefone_devedor, a.nome_cobrador, a.telefone_cobrador,
  a.motivo, a.pix_chave, a.pix_titular, a.pix_banco,
  a.recorrencia_tipo, a.recorrencia_freq, a.recorrencia_intervalo,
  a.ocorrencias_total, a.cadencia_etapas,
  a.aceito_em, a.arquivado_em, a.criado_em, a.atualizado_em,
  o.indice,
  o.data_combinada as linha_data,
  a.valor_centavos as linha_valor,
  case
    when o.status <> 'programado' then o.status
    when a.status in ('sem_aviso', 'aguardando_aceite', 'pausado',
                      'aguardando_aprovacao_aviso_editado', 'desregistrado',
                      'cancelado', 'recusado', 'expirado') then a.status
    else 'programado'::status_aviso
  end as linha_status
from public.avisos a
join public.aviso_ocorrencias o on o.aviso_id = a.id
where a.recorrencia_tipo is not null

union all

-- 3) Combinado RECORRENTE SEM ocorrencias (defensivo: agenda nao ativada ou linhas ainda
--    nao geradas): cai para uma linha unica com os dados do aviso, para nao sumir do filtro.
select
  a.id as aviso_id,
  a.cobrador_id, a.devedor_profile_id, a.direcao, a.criador_papel,
  a.nome_devedor, a.telefone_devedor, a.nome_cobrador, a.telefone_cobrador,
  a.motivo, a.pix_chave, a.pix_titular, a.pix_banco,
  a.recorrencia_tipo, a.recorrencia_freq, a.recorrencia_intervalo,
  a.ocorrencias_total, a.cadencia_etapas,
  a.aceito_em, a.arquivado_em, a.criado_em, a.atualizado_em,
  coalesce(a.ocorrencia_atual, 1) as indice,
  a.data_combinada as linha_data,
  a.valor_centavos as linha_valor,
  a.status as linha_status
from public.avisos a
where a.recorrencia_tipo is not null
  and not exists (select 1 from public.aviso_ocorrencias o where o.aviso_id = a.id);

comment on view public.combinado_linhas is
  'E9 H9.6: projecao uma-linha-por-ocorrencia (recorrente) ou uma-linha (simples) para o filtro por periodo do painel. linha_data/linha_valor/linha_status sao os dados efetivos da linha. Usada so quando ha periodo (de/ate); sem periodo o painel le public.avisos.';

-- A api consulta a view (totais + lista por periodo). security_invoker => o RLS de
-- avisos/aviso_ocorrencias (policies api_* using(true)) ja autoriza o whaviso_api.
grant select on public.combinado_linhas to whaviso_api;
