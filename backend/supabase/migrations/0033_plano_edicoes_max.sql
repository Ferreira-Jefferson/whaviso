-- E2 — H2.5 (G-C2): ALAVANCA de catálogo "quantidade de edições/reedições por plano".
--
-- A história diz que a quantidade de edições permitidas pode variar por plano (E11). O
-- DONO da alavanca é o catálogo de planos (padrão das alavancas da 0026); a MECÂNICA
-- (checar o teto no editarAviso, espelhando o limite de criação H2.3) é do service da
-- api, que LÊ este teto. O CONTADOR de edições é derivado de count(*) em
-- `avisos_edicoes` (0032), não uma coluna redundante.
--
-- Semântica: `edicoes_max` é o teto de edições por COMBINADO (não por conta). 0 = sem
-- limite explícito do catálogo NÃO: 0 significaria "não pode editar"; por isso usamos
-- um teto generoso por plano e deixamos claro que -1 não é usado. Valores escolhidos:
--   free            -> 0  (free não cria avisos que enviam; teto irrelevante, mas 0
--                          é coerente: free não chega a editar um aviso ativo)
--   start           -> 3
--   profissional    -> 10
--   plus            -> 10
-- Os valores são exemplos de catálogo (ajustáveis no cloud via upsert), não regra de
-- código. A api trata `edicoes_max` como teto: edições_feitas >= edicoes_max bloqueia.
--
-- Numeração: última = 0032; esta é 0033.

alter table public.planos add column if not exists edicoes_max integer not null default 0;

update public.planos set edicoes_max = 0  where id = 'free';
update public.planos set edicoes_max = 3  where id = 'start';
update public.planos set edicoes_max = 10 where id = 'profissional';
update public.planos set edicoes_max = 10 where id = 'plus';

-- Recria alavancas_do_plano incluindo edicoes_max (mesma resolução de default free).
-- DROP primeiro: a coluna OUT nova muda a assinatura de retorno (CREATE OR REPLACE não
-- altera o tipo de retorno de uma função existente).
drop function if exists public.alavancas_do_plano(uuid);
create function public.alavancas_do_plano(uid uuid)
returns table (
  plano_id text,
  capacidade_agenda integer,
  vagas_ativas integer,
  somente_leitura boolean,
  permite_recorrente boolean,
  cadencia_configuravel boolean,
  menu_texto_livre boolean,
  informado_pago_habilitado boolean,
  totais_periodo boolean,
  reengajamento_max integer,
  edicoes_max integer,
  unidades integer
)
language sql
stable
as $$
  with assi as (
    select coalesce(
             (select a.plano_id from public.assinaturas a where a.profile_id = uid),
             'free'
           ) as plano_id,
           (select a.unidades from public.assinaturas a where a.profile_id = uid) as unidades
  )
  select
    p.id,
    case when p.por_unidade
         then p.agenda_por_unidade * greatest(coalesce(assi.unidades, 1), 1)
         else p.capacidade_agenda end as capacidade_agenda,
    case
      when p.por_unidade
        then p.ativaveis_por_unidade * greatest(coalesce(assi.unidades, 1), 1)
      when p.vagas_ativas is not null
        then p.vagas_ativas
      else p.capacidade_agenda
    end as vagas_ativas,
    p.somente_leitura,
    p.permite_recorrente,
    p.cadencia_configuravel,
    p.menu_texto_livre,
    p.informado_pago_habilitado,
    p.totais_periodo,
    p.reengajamento_max,
    p.edicoes_max,
    assi.unidades
  from assi
  join public.planos p on p.id = assi.plano_id;
$$;

grant execute on function public.alavancas_do_plano(uuid) to whaviso_api;
