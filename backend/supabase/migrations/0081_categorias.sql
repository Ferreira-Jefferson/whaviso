-- E16: Categorias definidas pelo usuário (organização por marca/linha), para o público de
-- venda direta separar/filtrar combinados. Dono: módulo `categorias` da api. Categoria é
-- organização INTERNA do dono da conta; NUNCA vai para mensagem ao devedor.
-- "Remover" é soft-delete (arquivada=true): nenhum role tem DELETE (regra de não-DELETE).

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  nome text not null,
  cor text,
  arquivada boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint categorias_nome_tam check (char_length(nome) between 1 and 40),
  constraint categorias_cor_hex check (cor is null or cor ~ '^#[0-9a-fA-F]{6}$')
);

-- Nome único por conta entre as ativas (case-insensitive); índice das ativas p/ listagem.
create unique index categorias_unq    on public.categorias (profile_id, lower(nome)) where not arquivada;
create index        categorias_ativas on public.categorias (profile_id)              where not arquivada;

create trigger trg_categorias_atualizado_em
  before update on public.categorias
  for each row execute function public.tocar_atualizado_em();

-- Categoria opcional do combinado. on delete set null: arquivar/remover a categoria nunca
-- apaga o combinado (a coluna só zera na hipótese de DELETE físico, que não ocorre no app).
alter table public.avisos add column categoria_id uuid references public.categorias (id) on delete set null;
create index idx_avisos_categoria on public.avisos (categoria_id) where categoria_id is not null;

-- Grants + RLS no padrão das tabelas user-owned (0008/0012): só a api; sem DELETE; zap não acessa.
grant select, insert, update on public.categorias to whaviso_api;
alter table public.categorias enable row level security;
create policy api_categorias on public.categorias for all to whaviso_api using (true) with check (true);

-- ---------------------------------------------------------------------------------------
-- Recria a view combinado_linhas (E9 H9.6) para carregar `categoria_id`, de modo que o
-- filtro por categoria (H16.4) funcione também no caminho por período. `create or replace
-- view` só permite ACRESCENTAR colunas AO FINAL: por isso categoria_id entra como última
-- coluna de cada ramo (a ordem não importa para os SELECTs nomeados do repo).
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
  a.status as linha_status,
  a.categoria_id
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
  a.categoria_id
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
  a.categoria_id
from public.avisos a
where a.recorrencia_tipo is not null
  and not exists (select 1 from public.aviso_ocorrencias o where o.aviso_id = a.id);

grant select on public.combinado_linhas to whaviso_api;
