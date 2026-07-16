-- E16 (atualizado 2026-07-16): categorias por combinado passam de UMA (coluna
-- avisos.categoria_id, 0081) para VÁRIAS, via tabela de JUNÇÃO aviso_categorias. Motivo: a
-- venda direta faz pedidos mistos (mais de uma marca no mesmo combinado). O filtro do
-- painel vira semântica "contém"; a métrica por categoria (E18 H18.3) usa atribuição
-- integral. Categoria segue INTERNA do dono; nunca vai para mensagem ao devedor.
--
-- Ordem importa: (1) cria a junção, (2) BACKFILL de avisos.categoria_id -> junção,
-- (3) DROP da coluna e (4) DROP+CREATE da view (troca categoria_id por categoria_ids).

-- 1) Junção pura (aviso_id, categoria_id), ambos na PK. on delete cascade nos dois lados
--    para integridade referencial; na prática avisos/categorias nunca sofrem DELETE físico.
create table public.aviso_categorias (
  aviso_id     uuid not null references public.avisos (id)     on delete cascade,
  categoria_id uuid not null references public.categorias (id) on delete cascade,
  primary key (aviso_id, categoria_id)
);

-- Índice por categoria_id para o filtro "contém" e a métrica por categoria (o índice da PK
-- já cobre a busca por aviso_id).
create index idx_aviso_categorias_categoria on public.aviso_categorias (categoria_id);

-- Grants: EXCEÇÃO DELIBERADA de DELETE (documentada no MODULE.md de avisos). aviso_categorias
-- é JUNÇÃO PURA, não tabela de negócio/auditoria: definir as categorias de um combinado é
-- delete-all + insert (idempotente). Sem histórico a preservar (o combinado permanece; só o
-- rótulo de categoria muda). zap não acessa.
grant select, insert, delete on public.aviso_categorias to whaviso_api;
alter table public.aviso_categorias enable row level security;
create policy api_aviso_categorias on public.aviso_categorias for all to whaviso_api using (true) with check (true);

-- 2) BACKFILL: cada avisos.categoria_id não nulo vira uma linha na junção.
insert into public.aviso_categorias (aviso_id, categoria_id)
select id, categoria_id from public.avisos where categoria_id is not null
on conflict do nothing;

-- 3) Recria a view combinado_linhas (E9 H9.6): troca a coluna `categoria_id` por
--    `categoria_ids` (array agregado da junção). `create or replace view` só ACRESCENTA
--    colunas ao final, nunca troca o TIPO/nome de uma existente: por isso DROP + CREATE.
--    O DROP precisa vir ANTES do drop da coluna (a view depende de avisos.categoria_id).
--    Re-emitimos o grant (o drop leva o grant junto). categoria_ids entra como última
--    coluna de cada ramo; a ordem não importa para os SELECTs nomeados do repo.
drop view public.combinado_linhas;

-- 4) Remove a coluna única (e o índice idx_avisos_categoria, dropado em cascata com ela).
--    Só é possível depois do drop da view acima.
alter table public.avisos drop column categoria_id;

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
  array(select ac.categoria_id from public.aviso_categorias ac where ac.aviso_id = a.id) as categoria_ids
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
  array(select ac.categoria_id from public.aviso_categorias ac where ac.aviso_id = a.id) as categoria_ids
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
  array(select ac.categoria_id from public.aviso_categorias ac where ac.aviso_id = a.id) as categoria_ids
from public.avisos a
where a.recorrencia_tipo is not null
  and not exists (select 1 from public.aviso_ocorrencias o where o.aviso_id = a.id);

grant select on public.combinado_linhas to whaviso_api;
