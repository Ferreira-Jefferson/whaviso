// Leitura agregada do painel do operador. Acesso a dados SO via @whaviso/shared/db, sempre com
// sql`...` (parametrizado). Le APENAS agregados de: assinaturas, faturas, contas, lojas
// (id, conta_id, ativo, suspensa), prospectos (estagio, criado_em, so contagem). Tabelas de
// conteudo/uso de loja NAO podem aparecer aqui (guarda estatica em fronteira.test.ts).
// Limites de mes sao calculados no banco em America/Sao_Paulo e convertidos para timestamptz.
import { consultar, consultarUm, sql, type Consulta, type Executor } from '@whaviso/shared/db'

const FUSO = 'America/Sao_Paulo'

/** Inicio e fim (exclusivo) do mes corrente de Sao Paulo, como timestamptz. */
const MES_CORRENTE: Consulta = sql`
  (date_trunc('month', now() at time zone ${FUSO}) at time zone ${FUSO}) as ini,
  ((date_trunc('month', now() at time zone ${FUSO}) + interval '1 month') at time zone ${FUSO}) as fim,
  to_char(now() at time zone ${FUSO}, 'YYYY-MM') as mes`

export interface AssinaturasAgg {
  trial: number
  ativa: number
  suspensa: number
  cancelada: number
  mrr_centavos: number
  contas_ativas: number
  ativas_inicio: number
  mrr_inicio_centavos: number
  cancel_mes: number
  mrr_cancel_mes_centavos: number
  trials_encerrados: number
  trials_convertidos: number
  mes: string
}

/** Contagens por status, MRR e as bases de churn/conversao do mes corrente (1 query). */
export async function agregarAssinaturas(exec: Executor): Promise<AssinaturasAgg> {
  const r = await consultarUm<AssinaturasAgg>(
    exec,
    sql`with lim as (select ${MES_CORRENTE})
        select
          (count(a.id) filter (where a.status = 'trial'))::int as trial,
          (count(a.id) filter (where a.status = 'ativa'))::int as ativa,
          (count(a.id) filter (where a.status = 'suspensa'))::int as suspensa,
          (count(a.id) filter (where a.status = 'cancelada'))::int as cancelada,
          coalesce(sum(a.valor_mensal_centavos) filter (where a.status = 'ativa'), 0)::float8 as mrr_centavos,
          (count(distinct a.conta_id) filter (where a.status = 'ativa'))::int as contas_ativas,
          (count(a.id) filter (where a.inicio_em < lim.ini
                                 and (a.cancelada_em is null or a.cancelada_em >= lim.ini)))::int as ativas_inicio,
          coalesce(sum(a.valor_mensal_centavos) filter (where a.inicio_em < lim.ini
                                 and (a.cancelada_em is null or a.cancelada_em >= lim.ini)), 0)::float8 as mrr_inicio_centavos,
          (count(a.id) filter (where a.cancelada_em >= lim.ini and a.cancelada_em < lim.fim
                                 and a.inicio_em < lim.ini))::int as cancel_mes,
          coalesce(sum(a.valor_mensal_centavos) filter (where a.cancelada_em >= lim.ini
                                 and a.cancelada_em < lim.fim and a.inicio_em < lim.ini), 0)::float8 as mrr_cancel_mes_centavos,
          (count(a.id) filter (where a.trial_ate >= lim.ini and a.trial_ate < lim.fim))::int as trials_encerrados,
          (count(a.id) filter (where a.trial_ate >= lim.ini and a.trial_ate < lim.fim
                                 and a.inicio_em is not null))::int as trials_convertidos,
          lim.mes
        from lim left join public.assinaturas a on true
        group by lim.ini, lim.fim, lim.mes`,
  )
  if (!r) throw new Error('agregacao de assinaturas sem linha')
  return r
}

/** Lojas ativas: ativa no cadastro, nao suspensa pela plataforma e coberta por assinatura 'ativa'. */
export async function contarLojasAtivas(exec: Executor): Promise<number> {
  const r = await consultarUm<{ n: number }>(
    exec,
    sql`select count(*)::int as n
          from public.lojas l
         where l.ativo and not l.suspensa
           and exists (select 1 from public.assinaturas a
                        where a.conta_id = l.conta_id and a.status = 'ativa'
                          and (a.loja_id is null or a.loja_id = l.id))`,
  )
  return r?.n ?? 0
}

export async function contarNovasContasMes(exec: Executor): Promise<number> {
  const r = await consultarUm<{ n: number }>(
    exec,
    sql`with lim as (select ${MES_CORRENTE})
        select count(*)::int as n from public.contas c, lim
         where c.criado_em >= lim.ini and c.criado_em < lim.fim`,
  )
  return r?.n ?? 0
}

export interface FaturasAgg {
  inadimplencia_centavos: number
  inadimplencia_contas: number
  receita_mes_centavos: number
}

export async function agregarFaturas(exec: Executor): Promise<FaturasAgg> {
  const r = await consultarUm<FaturasAgg>(
    exec,
    sql`with lim as (select ${MES_CORRENTE})
        select
          coalesce(sum(f.valor_centavos) filter (where f.status = 'atrasada'), 0)::float8 as inadimplencia_centavos,
          (count(distinct f.conta_id) filter (where f.status = 'atrasada'))::int as inadimplencia_contas,
          coalesce(sum(f.valor_centavos) filter (where f.status = 'paga'
                      and f.pago_em >= lim.ini and f.pago_em < lim.fim), 0)::float8 as receita_mes_centavos
        from lim left join public.faturas f on true
        group by lim.ini, lim.fim`,
  )
  return r ?? { inadimplencia_centavos: 0, inadimplencia_contas: 0, receita_mes_centavos: 0 }
}

export interface FunilAgg {
  criados: number
  ativos: number
}

/** Prospectos criados no mes e, destes, os que ja estao no estagio 'ativo' (so contagem). */
export async function agregarFunil(exec: Executor): Promise<FunilAgg> {
  const r = await consultarUm<FunilAgg>(
    exec,
    sql`with lim as (select ${MES_CORRENTE})
        select count(p.id)::int as criados,
               (count(p.id) filter (where p.estagio = 'ativo'))::int as ativos
          from lim left join public.prospectos p
            on p.criado_em >= lim.ini and p.criado_em < lim.fim
         group by lim.ini`,
  )
  return r ?? { criados: 0, ativos: 0 }
}

export interface SerieLinha {
  mes: string
  mrr_centavos: number
  assinaturas_ativas: number
  ativas_inicio: number
  novas_contas: number
  cancelamentos: number
  receita_centavos: number
}

/**
 * Serie dos ultimos `n` meses (mais antigo primeiro). Por mes [ini, fim): ativa no fim = com
 * inicio antes de `fim` e sem cancelamento ate `fim`; MRR usa o valor ATUAL da assinatura
 * (aproximacao documentada). `n` ja validado (1..24) e passado como parametro.
 */
export async function serieMensal(exec: Executor, n: number): Promise<SerieLinha[]> {
  return consultar<SerieLinha>(
    exec,
    sql`with lim as (
          select to_char(m.ini, 'YYYY-MM') as mes,
                 (m.ini at time zone ${FUSO}) as ini,
                 ((m.ini + interval '1 month') at time zone ${FUSO}) as fim
            from generate_series(
                   date_trunc('month', now() at time zone ${FUSO}) - ((${n}::int - 1) * interval '1 month'),
                   date_trunc('month', now() at time zone ${FUSO}),
                   interval '1 month') as m(ini))
        select lim.mes,
          coalesce((select sum(a.valor_mensal_centavos) from public.assinaturas a
                     where a.inicio_em < lim.fim
                       and (a.cancelada_em is null or a.cancelada_em >= lim.fim)), 0)::float8 as mrr_centavos,
          (select count(*) from public.assinaturas a
            where a.inicio_em < lim.fim
              and (a.cancelada_em is null or a.cancelada_em >= lim.fim))::int as assinaturas_ativas,
          (select count(*) from public.assinaturas a
            where a.inicio_em < lim.ini
              and (a.cancelada_em is null or a.cancelada_em >= lim.ini))::int as ativas_inicio,
          (select count(*) from public.contas c
            where c.criado_em >= lim.ini and c.criado_em < lim.fim)::int as novas_contas,
          (select count(*) from public.assinaturas a
            where a.cancelada_em >= lim.ini and a.cancelada_em < lim.fim
              and a.inicio_em < lim.ini)::int as cancelamentos,
          coalesce((select sum(f.valor_centavos) from public.faturas f
                     where f.status = 'paga' and f.pago_em >= lim.ini
                       and f.pago_em < lim.fim), 0)::float8 as receita_centavos
        from lim order by lim.ini`,
  )
}
