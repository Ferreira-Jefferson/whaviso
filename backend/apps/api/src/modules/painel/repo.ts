import type { Pool } from '@whaviso/shared/db'
import type { PainelMetricasResposta, PainelResumoResposta, Pendencia } from '@whaviso/shared/contracts'
import { ATIVOS_NAO_PAGOS } from '../../shared/estados'

// Lista de estados "ativos não pagos" como literais SQL (fonte única em estados.ts).
const ATIVOS_SQL = ATIVOS_NAO_PAGOS.map((s) => `'${s}'`).join(',')

export interface FiltroPeriodo {
  uid: string
  de?: string
  ate?: string
}

/**
 * Totais POR PAPEL em centavos (H9.2). Cobre os dois fluxos (a posição é por papel,
 * não por direção): a receber/recebido = sou cobrador (cobrador_id); a pagar/pago = sou
 * devedor (devedor_profile_id). Terminais não-pagos ficam de fora por construção (não
 * estão em ATIVOS_NAO_PAGOS nem são `pago`). Isolamento por uid em todos os filtros.
 */
export async function totaisPorPapel(pool: Pool, f: FiltroPeriodo): Promise<PainelResumoResposta> {
  // E9 H9.6: com período, conta por OCORRÊNCIA (cada ocorrência soma no seu próprio
  // período), lendo a VIEW combinado_linhas; sem período, conta por COMBINADO lendo
  // public.avisos (comportamento de sempre; billing.useUsoAtivos chama sem período).
  const usaPeriodo = Boolean(f.de || f.ate)
  const fonte = usaPeriodo ? 'public.combinado_linhas' : 'public.avisos'
  const vlr = usaPeriodo ? 'linha_valor' : 'valor_centavos'
  const st = usaPeriodo ? 'linha_status' : 'status'
  const dt = usaPeriodo ? 'linha_data' : 'data_combinada'
  const params: unknown[] = [f.uid]
  const periodo: string[] = []
  if (f.de) {
    params.push(f.de)
    periodo.push(`and ${dt} >= $${params.length}`)
  }
  if (f.ate) {
    params.push(f.ate)
    periodo.push(`and ${dt} <= $${params.length}`)
  }
  const p = periodo.join(' ')
  const { rows } = await pool.query(
    `select
       coalesce(sum(${vlr}) filter (
         where cobrador_id=$1 and ${st} in (${ATIVOS_SQL}) ${p}), 0)::bigint as a_receber_c,
       count(*) filter (
         where cobrador_id=$1 and ${st} in (${ATIVOS_SQL}) ${p})::int as a_receber_q,
       coalesce(sum(${vlr}) filter (
         where cobrador_id=$1 and ${st}='pago' ${p}), 0)::bigint as recebido_c,
       count(*) filter (where cobrador_id=$1 and ${st}='pago' ${p})::int as recebido_q,
       coalesce(sum(${vlr}) filter (
         where devedor_profile_id=$1 and ${st} in (${ATIVOS_SQL}) ${p}), 0)::bigint as a_pagar_c,
       count(*) filter (
         where devedor_profile_id=$1 and ${st} in (${ATIVOS_SQL}) ${p})::int as a_pagar_q,
       coalesce(sum(${vlr}) filter (
         where devedor_profile_id=$1 and ${st}='pago' ${p}), 0)::bigint as pago_c,
       count(*) filter (where devedor_profile_id=$1 and ${st}='pago' ${p})::int as pago_q,
       -- legado: contagem por estado no papel cobrador (billing.useUsoAtivos).
       count(*) filter (where cobrador_id=$1 and ${st}='programado' ${p})::int as qtd_prog,
       count(*) filter (where cobrador_id=$1 and ${st}='aguardando_aceite' ${p})::int as qtd_ag
     from ${fonte}
     where (cobrador_id=$1 or devedor_profile_id=$1)`,
    params,
  )
  const r = rows[0]
  const aReceber = Number(r.a_receber_c)
  const recebido = Number(r.recebido_c)
  const pago = Number(r.pago_c)
  return {
    a_receber_centavos: aReceber,
    a_receber_qtd: r.a_receber_q,
    recebido_centavos: recebido,
    recebido_qtd: r.recebido_q,
    a_pagar_centavos: Number(r.a_pagar_c),
    a_pagar_qtd: r.a_pagar_q,
    pago_centavos: pago,
    pago_qtd: r.pago_q,
    // Legado (compatibilidade com o front antigo / billing).
    pendentes_centavos: aReceber,
    recebidos_centavos: recebido,
    pagos_centavos: pago,
    qtd_pendentes: r.qtd_prog,
    qtd_aguardando_aceite: r.qtd_ag,
  }
}

interface LinhaPendencia {
  aviso_id: string
  tipo: Pendencia['tipo']
  papel: Pendencia['papel']
  nome_outra_ponta: string
  motivo: string
  valor_centavos: string
  data_combinada: string
}

/**
 * "Precisa de você" (H9.2): combinados que aguardam ação do usuário. Sem PII além do
 * nome da outra ponta (necessário para o item ser reconhecível). Isolamento por uid.
 *  - confirmar_pagamento: como COBRADOR, avisos em `informado_pago`;
 *  - aprovar_edicao: como CRIADOR (cobrador no receber, devedor no invertido), avisos em
 *    `aguardando_aprovacao_aviso_editado` (você editou; aguarda a outra ponta / pode desfazer).
 * A "outra ponta" é o nome do devedor quando sou cobrador, e o nome do cobrador quando sou
 * devedor (no invertido). dado_incorreto/telefone_divergente: gated (E5), não emitidos hoje.
 */
export async function pendencias(pool: Pool, uid: string): Promise<Pendencia[]> {
  const { rows } = await pool.query<LinhaPendencia>(
    `select aviso_id, tipo, papel, nome_outra_ponta, motivo,
            valor_centavos::bigint as valor_centavos,
            to_char(data_combinada,'YYYY-MM-DD') as data_combinada
     from (
       -- Confirmar pagamento informado: só o COBRADOR do aviso.
       select id as aviso_id, 'confirmar_pagamento'::text as tipo, 'cobrador'::text as papel,
              nome_devedor as nome_outra_ponta, motivo, valor_centavos, data_combinada,
              data_combinada as ord
         from public.avisos
        where status = 'informado_pago' and cobrador_id = $1
       union all
       -- Aprovar/aguardar edição: o CRIADOR (cobrador ou devedor no invertido).
       select id, 'aprovar_edicao', criador_papel::text,
              case when criador_papel = 'cobrador' then nome_devedor
                   else coalesce(nome_cobrador, nome_devedor) end,
              motivo, valor_centavos, data_combinada, data_combinada
         from public.avisos
        where status = 'aguardando_aprovacao_aviso_editado'
          and ((criador_papel = 'cobrador' and cobrador_id = $1)
               or (criador_papel = 'devedor' and devedor_profile_id = $1))
     ) p
     order by ord asc`,
    [uid],
  )
  return rows.map((l) => ({
    aviso_id: l.aviso_id,
    tipo: l.tipo,
    papel: l.papel,
    nome_outra_ponta: l.nome_outra_ponta,
    motivo: l.motivo,
    valor_centavos: Number(l.valor_centavos),
    data_combinada: l.data_combinada,
  }))
}

// ---- Métricas de negócio (Fase A, papel COBRADOR) --------------------------------------

export interface FiltroMetricas {
  uid: string
  de?: string
  ate?: string
  categoria_id?: string
  sem_categoria?: boolean
  inativoDias: number
}

/**
 * Saúde do negócio do dono como COBRADOR (o que vende/recebe): recebido, a receber, custo
 * e LUCRO (só onde o custo foi informado, para não inflar), ticket médio, melhores clientes,
 * quebra por categoria e clientes inativos. Tudo no servidor (H9.8), isolado por uid.
 * Telefone só no corpo (nunca em log/rota, H13.8). Período em data_combinada; combinado a
 * combinado (não desmembra recorrência, decisão da v1). Lucro é sempre realizado (`pago`).
 */
export async function metricas(pool: Pool, f: FiltroMetricas): Promise<PainelMetricasResposta> {
  // WHERE do escopo cobrador (+ período + categoria), compartilhado pelos agregados e melhores.
  const params: unknown[] = [f.uid]
  const cond: string[] = ['cobrador_id = $1']
  if (f.de) {
    params.push(f.de)
    cond.push(`data_combinada >= $${params.length}`)
  }
  if (f.ate) {
    params.push(f.ate)
    cond.push(`data_combinada <= $${params.length}`)
  }
  if (f.categoria_id) {
    params.push(f.categoria_id)
    cond.push(`categoria_id = $${params.length}`)
  } else if (f.sem_categoria) {
    cond.push('categoria_id is null')
  }
  const where = cond.join(' and ')

  // 1) Agregados + lucro (lucro só onde há custo informado; lucro_base_qtd diz quantos).
  const agg = await pool.query(
    `select
       coalesce(sum(valor_centavos) filter (where status='pago'),0)::bigint as recebido_c,
       count(*) filter (where status='pago')::int as recebido_q,
       coalesce(sum(valor_centavos) filter (where status in (${ATIVOS_SQL})),0)::bigint as a_receber_c,
       count(*) filter (where status in (${ATIVOS_SQL}))::int as a_receber_q,
       coalesce(sum(valor_custo_centavos) filter (where status='pago' and valor_custo_centavos is not null),0)::bigint as custo_pago_c,
       coalesce(sum(valor_centavos - valor_custo_centavos) filter (where status='pago' and valor_custo_centavos is not null),0)::bigint as lucro_c,
       count(*) filter (where status='pago' and valor_custo_centavos is not null)::int as lucro_base_q
     from public.avisos where ${where}`,
    params,
  )
  const a = agg.rows[0]
  const recebido = Number(a.recebido_c)
  const recebidoQ = a.recebido_q as number
  const ticket = recebidoQ > 0 ? Math.round(recebido / recebidoQ) : 0

  // 2) Melhores clientes (top 5 por recebido). Nome mais recente daquele número.
  const melhores = await pool.query(
    `select telefone_devedor as telefone,
            (array_agg(nome_devedor order by data_combinada desc))[1] as nome,
            coalesce(sum(valor_centavos) filter (where status='pago'),0)::bigint as recebido_c,
            count(*) filter (where status='pago')::int as qtd
       from public.avisos
      where ${where} and telefone_devedor is not null
      group by telefone_devedor
      having count(*) filter (where status='pago') > 0
      order by recebido_c desc
      limit 5`,
    params,
  )

  // 3) Quebra por categoria (respeita só o período, não o filtro de categoria: é a visão geral).
  const catParams: unknown[] = [f.uid]
  const catCond: string[] = ['a.cobrador_id = $1']
  if (f.de) {
    catParams.push(f.de)
    catCond.push(`a.data_combinada >= $${catParams.length}`)
  }
  if (f.ate) {
    catParams.push(f.ate)
    catCond.push(`a.data_combinada <= $${catParams.length}`)
  }
  const porCategoria = await pool.query(
    `select a.categoria_id, c.nome, c.cor,
            coalesce(sum(a.valor_centavos) filter (where a.status='pago'),0)::bigint as recebido_c,
            coalesce(sum(a.valor_centavos) filter (where a.status in (${ATIVOS_SQL})),0)::bigint as a_receber_c,
            coalesce(sum(a.valor_centavos - a.valor_custo_centavos) filter (where a.status='pago' and a.valor_custo_centavos is not null),0)::bigint as lucro_c,
            count(*)::int as qtd
       from public.avisos a
       left join public.categorias c on c.id = a.categoria_id
      where ${catCond.join(' and ')}
      group by a.categoria_id, c.nome, c.cor
      order by recebido_c desc`,
    catParams,
  )

  // 4) Inativos (sem período): sem combinado ativo e última data além de N dias.
  const inativos = await pool.query(
    `select telefone_devedor as telefone,
            (array_agg(nome_devedor order by data_combinada desc))[1] as nome,
            to_char(max(data_combinada),'YYYY-MM-DD') as ultima_data,
            (current_date - max(data_combinada))::int as dias
       from public.avisos
      where cobrador_id = $1 and telefone_devedor is not null
      group by telefone_devedor
      having count(*) filter (where status in (${ATIVOS_SQL})) = 0
         and max(data_combinada) < current_date - ($2::int)
      order by max(data_combinada) asc
      limit 10`,
    [f.uid, f.inativoDias],
  )

  return {
    recebido_centavos: recebido,
    recebido_qtd: recebidoQ,
    a_receber_centavos: Number(a.a_receber_c),
    a_receber_qtd: a.a_receber_q,
    custo_pago_centavos: Number(a.custo_pago_c),
    lucro_centavos: Number(a.lucro_c),
    lucro_base_qtd: a.lucro_base_q,
    ticket_medio_centavos: ticket,
    melhores_clientes: melhores.rows.map((m) => ({
      nome: m.nome,
      telefone: m.telefone,
      recebido_centavos: Number(m.recebido_c),
      qtd: m.qtd,
    })),
    por_categoria: porCategoria.rows.map((c) => ({
      categoria_id: c.categoria_id,
      nome: c.nome,
      cor: c.cor,
      recebido_centavos: Number(c.recebido_c),
      a_receber_centavos: Number(c.a_receber_c),
      lucro_centavos: Number(c.lucro_c),
      qtd: c.qtd,
    })),
    inativos: inativos.rows.map((i) => ({
      nome: i.nome,
      telefone: i.telefone,
      ultima_data: i.ultima_data,
      dias: i.dias,
    })),
  }
}
