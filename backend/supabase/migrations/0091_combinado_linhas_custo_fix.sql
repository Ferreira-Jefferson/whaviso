-- FIX: a migration 0090 recriou a view `combinado_linhas` (drop+create p/ trocar
-- categoria_id -> categoria_ids) baseada na versão da 0081, esquecendo a coluna
-- `valor_custo_centavos` que a 0082 já tinha adicionado a ela (Fase A, resultado do
-- combinado). Efeito: `GET /avisos` com filtro de período (usa esta view) e
-- `GET /painel/resumo` com período quebravam com "coluna valor_custo_centavos não
-- existe" -> 500 erro_interno. Corrige recriando a view com TODAS as colunas atuais
-- (base + categoria_ids da 0090 + valor_custo_centavos da 0082), sem perder nada.

drop view public.combinado_linhas;

create view public.combinado_linhas
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
  a.status as linha_status,
  array(select ac.categoria_id from public.aviso_categorias ac where ac.aviso_id = a.id) as categoria_ids,
  a.valor_custo_centavos
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
  end as linha_status,
  array(select ac.categoria_id from public.aviso_categorias ac where ac.aviso_id = a.id) as categoria_ids,
  a.valor_custo_centavos
from public.avisos a
join public.aviso_ocorrencias o on o.aviso_id = a.id
where a.recorrencia_tipo is not null

union all

-- 3) Combinado RECORRENTE SEM ocorrencias (defensivo): uma linha unica com dados do aviso.
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
  a.status as linha_status,
  array(select ac.categoria_id from public.aviso_categorias ac where ac.aviso_id = a.id) as categoria_ids,
  a.valor_custo_centavos
from public.avisos a
where a.recorrencia_tipo is not null
  and not exists (select 1 from public.aviso_ocorrencias o where o.aviso_id = a.id);

grant select on public.combinado_linhas to whaviso_api;
