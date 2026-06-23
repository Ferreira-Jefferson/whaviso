import type { Pool } from '@whaviso/shared/db'
import type { PainelResumoResposta, Pendencia } from '@whaviso/shared/contracts'
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
  const params: unknown[] = [f.uid]
  const periodo: string[] = []
  if (f.de) {
    params.push(f.de)
    periodo.push(`and data_combinada >= $${params.length}`)
  }
  if (f.ate) {
    params.push(f.ate)
    periodo.push(`and data_combinada <= $${params.length}`)
  }
  const p = periodo.join(' ')
  const { rows } = await pool.query(
    `select
       coalesce(sum(valor_centavos) filter (
         where cobrador_id=$1 and status in (${ATIVOS_SQL}) ${p}), 0)::bigint as a_receber_c,
       count(*) filter (
         where cobrador_id=$1 and status in (${ATIVOS_SQL}) ${p})::int as a_receber_q,
       coalesce(sum(valor_centavos) filter (
         where cobrador_id=$1 and status='pago' ${p}), 0)::bigint as recebido_c,
       count(*) filter (where cobrador_id=$1 and status='pago' ${p})::int as recebido_q,
       coalesce(sum(valor_centavos) filter (
         where devedor_profile_id=$1 and status in (${ATIVOS_SQL}) ${p}), 0)::bigint as a_pagar_c,
       count(*) filter (
         where devedor_profile_id=$1 and status in (${ATIVOS_SQL}) ${p})::int as a_pagar_q,
       coalesce(sum(valor_centavos) filter (
         where devedor_profile_id=$1 and status='pago' ${p}), 0)::bigint as pago_c,
       count(*) filter (where devedor_profile_id=$1 and status='pago' ${p})::int as pago_q,
       -- legado: contagem por estado no papel cobrador (billing.useUsoAtivos).
       count(*) filter (where cobrador_id=$1 and status='programado' ${p})::int as qtd_prog,
       count(*) filter (where cobrador_id=$1 and status='aguardando_aceite' ${p})::int as qtd_ag
     from public.avisos
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
