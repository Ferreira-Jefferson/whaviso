-- E7 (item novo, plano 2026-07-22 grupo 1B): "aprovação de dado incorreto". Hoje o
-- aceite já tem a opção "algum dado está incorreto" (E5 H5.4), mas ela só NOTIFICA o
-- criador (evento `pix_incorreto` da 0035), sem um fluxo estruturado de aprovar/recusar
-- com os dados corrigidos. Este item cobre SÓ o schema + a decisão do cobrador
-- (aprovar/recusar); a ESCRITA do reporte pelo devedor (zap-side, webhook) e a redação
-- da história de aceite ficam com o grupo 1E (wave 2), que roda depois desta migration
-- já aplicada localmente.
--
-- Campos que o devedor pode reportar como incorretos (decidido): valor, data,
-- nome/motivo (agrupados como 'nome_motivo': normalmente reportados juntos, e são os
-- dois campos "descritivos" do combinado). Chave Pix NÃO entra nesta lista (tem o seu
-- próprio sinal dedicado, `pix_incorreto`, 0035).
--
-- Mecanismo: espelha `avisos_edicoes` (0032): tabela append-only (auditoria/negócio,
-- nunca DELETE), no máximo UM reporte pendente por aviso, resolução fecha o ciclo sem
-- apagar a linha. Ao ficar pendente, o aviso vai para o novo estado
-- `aguardando_aprovacao_dado_incorreto` (suspende os lembretes, mesma disciplina de
-- `aguardando_aprovacao_aviso_editado`); ao resolver (aprovar/recusar), volta a
-- `programado` e o ciclo é reprogramado.
--
-- DECISÃO (aprovar): ao aprovar, a api NÃO aplica a edição sozinha: devolve o reporte
-- (campo + dados corretos informados pelo devedor) para o painel reabrir o fluxo de
-- EDIÇÃO já existente, pré-preenchido e destacado, e o cobrador confirma/envia como
-- uma edição normal (mesmo caminho de `editarAviso`/`aguardando_aprovacao_aviso_editado`
-- quando já houve aceite). Por isso esta migration não precisa de coluna extra em
-- `avisos_edicoes` para marcar a origem: a marca fica no `detalhes` do evento
-- `editado` (jsonb, ver service.ts), sem mexer no schema de edições.
--
-- Numeração: última migration = 0091; esta é 0092.
-- ADD VALUE de enum + create table; nenhum DML usa os valores novos nesta mesma
-- transação (auto-commit por statement via psql, igual 0028/0011).

-- ---------------------------------------------------------------------------------------
-- 1) Novo estado + novos eventos (idempotente).
-- ---------------------------------------------------------------------------------------
alter type status_aviso add value if not exists 'aguardando_aprovacao_dado_incorreto';

alter type tipo_evento add value if not exists 'dado_incorreto_reportado';
alter type tipo_evento add value if not exists 'dado_incorreto_aprovado';
alter type tipo_evento add value if not exists 'dado_incorreto_recusado';

-- ---------------------------------------------------------------------------------------
-- 2) Tabela `avisos_reportes` (espelha avisos_edicoes, 0032): append-only, sem DELETE.
-- ---------------------------------------------------------------------------------------
create table if not exists public.avisos_reportes (
  id bigint generated always as identity primary key,
  aviso_id uuid not null references public.avisos (id) on delete cascade,
  -- Campo apontado como incorreto pelo devedor. Pix NÃO entra (sinal próprio, 0035).
  campo text not null check (campo in ('valor', 'data', 'nome_motivo')),
  -- Valores que o DEVEDOR informou como CORRETOS ao reportar (snapshot; o formato
  -- depende de `campo`): valor -> {valor_centavos}; data -> {data_combinada};
  -- nome_motivo -> {nome_devedor?, motivo?}. Escrito pelo zap (grupo 1E) ao registrar
  -- o reporte; lido pela api ao aprovar (reabre a edição pré-preenchida).
  dados_corretos jsonb not null,
  -- Fecho do reporte. null seria mais raro de tratar (índice parcial abaixo); usamos
  -- 'pendente' como default explícito (mais simples de comparar em SELECT/CHECK).
  resolucao text not null default 'pendente' check (resolucao in ('pendente', 'aprovado', 'recusado')),
  resolvido_em timestamptz,
  criado_em timestamptz not null default now()
);

create index if not exists idx_avisos_reportes_aviso on public.avisos_reportes (aviso_id);
-- No máximo UM reporte pendente por aviso (o aviso só fica em
-- aguardando_aprovacao_dado_incorreto por um reporte de cada vez).
create unique index if not exists idx_avisos_reportes_pendente
  on public.avisos_reportes (aviso_id)
  where resolucao = 'pendente';

-- Grants: api lê/resolve (sem DELETE: auditoria/negócio, nunca some); zap só REPORTA
-- (insere), nunca resolve. Espelha o padrão da 0032.
grant select, insert, update on public.avisos_reportes to whaviso_api;
grant select, insert on public.avisos_reportes to whaviso_zap;
alter table public.avisos_reportes enable row level security;
create policy api_avisos_reportes on public.avisos_reportes
  for all to whaviso_api using (true) with check (true);
-- Postgres não aceita "for select, insert" (uma única policy só declara UM comando).
-- O teto real de privilégio já vem do GRANT acima (só select+insert); aqui "for all"
-- é seguro porque a role nunca teria UPDATE/DELETE para a policy autorizar.
create policy zap_avisos_reportes on public.avisos_reportes
  for all to whaviso_zap using (true) with check (true);

-- ---------------------------------------------------------------------------------------
-- 3) Máquina de estados: acrescenta as transições de/para o novo estado (mesma forma de
--    aguardando_aprovacao_aviso_editado). Substitui a versão de 0028 (a mais recente).
-- ---------------------------------------------------------------------------------------
create or replace function public.validar_transicao_aviso()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'sem_aviso' and new.status in ('aguardando_aceite', 'cancelado', 'pago')) or
    (old.status = 'aguardando_aceite' and new.status in ('programado', 'cancelado', 'expirado', 'recusado')) or
    (old.status = 'programado' and new.status in (
       'informado_pago', 'pago', 'cancelado', 'expirado',
       'pausado', 'aguardando_aprovacao_aviso_editado', 'aguardando_aprovacao_dado_incorreto',
       'desregistrado')) or
    (old.status = 'informado_pago' and new.status in ('pago', 'programado', 'cancelado', 'expirado')) or
    (old.status = 'pago' and new.status = 'programado') or -- reabertura (E8 H8.6)
    (old.status = 'pausado' and new.status in ('programado', 'cancelado', 'expirado')) or
    (old.status = 'aguardando_aprovacao_aviso_editado' and new.status in ('programado', 'cancelado', 'expirado')) or
    (old.status = 'aguardando_aprovacao_dado_incorreto' and new.status in ('programado', 'cancelado', 'expirado')) or
    (old.status = 'desregistrado' and new.status in ('programado', 'cancelado', 'expirado'))
  ) then
    raise exception 'transicao de status invalida: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- 4) Encerramento dos envios: o novo estado é de SUSPENSÃO (lembretes pausados enquanto
--    o cobrador não decide), igual aguardando_aprovacao_aviso_editado. Substitui a
--    versão de 0038 (a mais recente).
-- ---------------------------------------------------------------------------------------
create or replace function public.encerrar_envios_do_aviso()
returns trigger
language plpgsql
as $$
begin
  if old.status = new.status then
    return new;
  end if;

  if new.status in ('pago', 'cancelado', 'recusado', 'expirado') then
    -- TERMINAL: cancela definitivo e libera o segundo (preserva _orig p/ reabertura).
    update public.envios
      set status = 'cancelado', erro = coalesce(erro, 'aviso_' || new.status)
      where aviso_id = new.id and status in ('agendado', 'processando');
    update public.avisos
      set horario_reservado_orig = coalesce(horario_reservado_orig, horario_reservado_seg),
          horario_reservado_seg = null
      where id = new.id;

  elsif new.status in ('pausado', 'aguardando_aprovacao_aviso_editado',
                        'aguardando_aprovacao_dado_incorreto', 'desregistrado') then
    -- SUSPENSÃO: cancela os envios pendentes (marcador 'suspenso'), mantém o segundo
    -- reservado (a reativação/decisão re-arma a partir dele).
    update public.envios
      set status = 'cancelado', erro = 'suspenso'
      where aviso_id = new.id and status in ('agendado', 'processando');
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- 5) View combinado_linhas (0091, período de GET /avisos): o CASE de linha_status cai
--    em 'else programado' para qualquer status fora da lista explícita. Sem este ajuste,
--    um combinado em aguardando_aprovacao_dado_incorreto apareceria (errado) como
--    programado na visão por período. Recria com a lista completa (base 0091 + o
--    estado novo), preservando todas as colunas atuais.
-- ---------------------------------------------------------------------------------------
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
                      'aguardando_aprovacao_aviso_editado', 'aguardando_aprovacao_dado_incorreto',
                      'desregistrado', 'cancelado', 'recusado', 'expirado') then a.status
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
