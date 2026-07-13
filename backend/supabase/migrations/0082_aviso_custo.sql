-- Fase A (estudo revendedores): custo opcional do combinado, para o dono saber o RESULTADO
-- (quanto sobrou), não só o quanto vendeu. Dado INTERNO do dono: nunca vai para mensagem ao
-- devedor; edição livre (não abre reaprovação). Centavos, como todo dinheiro. Pode ser 0.
alter table public.avisos add column valor_custo_centavos bigint;
alter table public.avisos
  add constraint avisos_custo_nao_negativo
  check (valor_custo_centavos is null or valor_custo_centavos >= 0);

-- Recria a view combinado_linhas para carregar também valor_custo_centavos (append ao final,
-- depois de categoria_id da 0081). A ordem não importa para os SELECTs nomeados do repo.
create or replace view public.combinado_linhas
with (security_invoker = true) as
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
  a.categoria_id,
  a.valor_custo_centavos
from public.avisos a
where a.recorrencia_tipo is null

union all

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
  a.categoria_id,
  a.valor_custo_centavos
from public.avisos a
join public.aviso_ocorrencias o on o.aviso_id = a.id
where a.recorrencia_tipo is not null

union all

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
  a.categoria_id,
  a.valor_custo_centavos
from public.avisos a
where a.recorrencia_tipo is not null
  and not exists (select 1 from public.aviso_ocorrencias o where o.aviso_id = a.id);

grant select on public.combinado_linhas to whaviso_api;
