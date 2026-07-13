import type { Pool } from '@whaviso/shared/db'
import type {
  Aviso,
  DirecaoAviso,
  EtapaEnvio,
  PapelAviso,
  StatusAviso,
  SugestaoPessoa,
} from '@whaviso/shared/contracts'
import { ATIVOS_NAO_PAGOS } from '../../shared/estados'

// "Ativos não pagos" como literais SQL (fonte única em estados.ts). Igual ao painel.
const ATIVOS_SQL = ATIVOS_NAO_PAGOS.map((s) => `'${s}'`).join(',')

// Mesmas colunas do módulo avisos (a fronteira do lint impede importar aquele módulo):
// o item da lista por pessoa tem o MESMO shape de Aviso, para o front reusar as colunas
// do painel. Se mudar lá, mude aqui (contrato compartilhado é o avisoSchema).
const COLS = `
  id, cobrador_id, devedor_profile_id, direcao, criador_papel, status,
  nome_devedor, telefone_devedor, nome_cobrador, telefone_cobrador, motivo,
  valor_centavos::bigint as valor_centavos,
  to_char(data_combinada, 'YYYY-MM-DD') as data_combinada, pix_chave,
  pix_titular, pix_banco,
  recorrencia_tipo, recorrencia_freq, recorrencia_intervalo,
  ocorrencias_total, ocorrencia_atual,
  cadencia_etapas::text[] as cadencia_etapas,
  aceito_em, arquivado_em, criado_em, atualizado_em
`

interface LinhaAviso {
  id: string
  cobrador_id: string | null
  devedor_profile_id: string | null
  direcao: DirecaoAviso
  criador_papel: PapelAviso
  status: StatusAviso
  nome_devedor: string
  telefone_devedor: string | null
  nome_cobrador: string | null
  telefone_cobrador: string | null
  motivo: string
  valor_centavos: string
  data_combinada: string
  pix_chave: string | null
  pix_titular: string | null
  pix_banco: string | null
  recorrencia_tipo: 'periodo' | 'avulsas' | null
  recorrencia_freq: 'mensal' | 'semanal' | null
  recorrencia_intervalo: number | null
  ocorrencias_total: number | null
  ocorrencia_atual: number | null
  cadencia_etapas: EtapaEnvio[] | null
  aceito_em: Date | null
  arquivado_em: Date | null
  criado_em: Date
  atualizado_em: Date
}

function mapear(l: LinhaAviso): Aviso {
  return { ...l, valor_centavos: Number(l.valor_centavos) }
}

export interface PessoaRef {
  /** Telefone da OUTRA PONTA (E.164): a identidade da pessoa. */
  telefone: string
  /** Nome registrado no combinado de ENTRADA (rótulo, não chave). */
  nome_entrada: string
}

/**
 * Resolve, NO SERVIDOR, a identidade da pessoa (telefone da outra ponta) a partir de um
 * combinado do usuário (H15.1/H15.7): sou cobrador -> outra ponta é o devedor; sou devedor
 * (invertido) -> é o cobrador. Isolamento por uid. null quando o combinado não é visível
 * ou ainda não tem telefone da outra ponta (ex.: agenda sem_aviso antes de ativar).
 */
export async function resolverPessoaPorAviso(
  pool: Pool,
  uid: string,
  avisoId: string,
): Promise<PessoaRef | null> {
  const { rows } = await pool.query<{ telefone: string | null; nome_entrada: string }>(
    `select
       case when cobrador_id = $2 then telefone_devedor else telefone_cobrador end as telefone,
       case when cobrador_id = $2 then nome_devedor
            else coalesce(nome_cobrador, nome_devedor) end as nome_entrada
     from public.avisos
     where id = $1 and (cobrador_id = $2 or devedor_profile_id = $2)`,
    [avisoId, uid],
  )
  const r = rows[0]
  if (!r || !r.telefone) return null
  return { telefone: r.telefone, nome_entrada: r.nome_entrada }
}

export interface TotaisPessoa {
  a_receber_centavos: number
  a_receber_qtd: number
  recebido_centavos: number
  recebido_qtd: number
  a_pagar_centavos: number
  a_pagar_qtd: number
  pago_centavos: number
  pago_qtd: number
  // Fase A (A4): última venda para a pessoa (sou COBRADOR) e dias corridos até hoje. null
  // quando nunca vendi (só relação em que eu pago). Data em America/Sao_Paulo (current_date).
  ultima_compra: string | null
  dias_desde_ultima_compra: number | null
}

/**
 * Totais dos QUATRO lados com aquele TELEFONE (H15.2), em centavos, calculados no banco.
 * Identidade pelo número (o nome é ignorado): a receber/recebido quando sou COBRADOR e o
 * devedor tem aquele telefone; a pagar/pago quando sou DEVEDOR e o cobrador tem aquele
 * telefone. Terminais não pagos ficam de fora por construção. Isolamento por uid.
 */
export async function totaisPorPessoa(
  pool: Pool,
  uid: string,
  telefone: string,
): Promise<TotaisPessoa> {
  const { rows } = await pool.query(
    `select
       coalesce(sum(valor_centavos) filter (
         where cobrador_id=$1 and telefone_devedor=$2 and status in (${ATIVOS_SQL})), 0)::bigint as a_receber_c,
       count(*) filter (
         where cobrador_id=$1 and telefone_devedor=$2 and status in (${ATIVOS_SQL}))::int as a_receber_q,
       coalesce(sum(valor_centavos) filter (
         where cobrador_id=$1 and telefone_devedor=$2 and status='pago'), 0)::bigint as recebido_c,
       count(*) filter (where cobrador_id=$1 and telefone_devedor=$2 and status='pago')::int as recebido_q,
       coalesce(sum(valor_centavos) filter (
         where devedor_profile_id=$1 and telefone_cobrador=$2 and status in (${ATIVOS_SQL})), 0)::bigint as a_pagar_c,
       count(*) filter (
         where devedor_profile_id=$1 and telefone_cobrador=$2 and status in (${ATIVOS_SQL}))::int as a_pagar_q,
       coalesce(sum(valor_centavos) filter (
         where devedor_profile_id=$1 and telefone_cobrador=$2 and status='pago'), 0)::bigint as pago_c,
       count(*) filter (where devedor_profile_id=$1 and telefone_cobrador=$2 and status='pago')::int as pago_q,
       -- A4: última VENDA (sou cobrador daquele número) e dias corridos até hoje (Sao_Paulo).
       to_char(max(data_combinada) filter (where cobrador_id=$1 and telefone_devedor=$2),
               'YYYY-MM-DD') as ultima_compra,
       (current_date - max(data_combinada) filter (where cobrador_id=$1 and telefone_devedor=$2))::int as dias_ultima
     from public.avisos
     where (cobrador_id=$1 and telefone_devedor=$2)
        or (devedor_profile_id=$1 and telefone_cobrador=$2)`,
    [uid, telefone],
  )
  const r = rows[0]
  return {
    a_receber_centavos: Number(r.a_receber_c),
    a_receber_qtd: r.a_receber_q,
    recebido_centavos: Number(r.recebido_c),
    recebido_qtd: r.recebido_q,
    a_pagar_centavos: Number(r.a_pagar_c),
    a_pagar_qtd: r.a_pagar_q,
    pago_centavos: Number(r.pago_c),
    pago_qtd: r.pago_q,
    ultima_compra: r.ultima_compra ?? null,
    dias_desde_ultima_compra: r.dias_ultima === null ? null : Number(r.dias_ultima),
  }
}

export interface CombinadoDaPessoa {
  aviso: Aviso
  /** Nome da OUTRA PONTA registrado NESTE combinado (chave do agrupamento por nome). */
  nome_outra_ponta: string
}

/**
 * Todos os combinados do usuário com aquele TELEFONE (H15.3), independentemente do papel.
 * Traz o nome da outra ponta registrado em cada combinado, para o serviço agrupar por nome.
 * Ordem por data combinada desc (desempate por criado_em). Isolamento por uid.
 */
export async function combinadosPorPessoa(
  pool: Pool,
  uid: string,
  telefone: string,
): Promise<CombinadoDaPessoa[]> {
  const { rows } = await pool.query<LinhaAviso & { nome_outra_ponta: string }>(
    `select ${COLS},
       case when cobrador_id=$1 then nome_devedor
            else coalesce(nome_cobrador, nome_devedor) end as nome_outra_ponta
     from public.avisos
     where (cobrador_id=$1 and telefone_devedor=$2)
        or (devedor_profile_id=$1 and telefone_cobrador=$2)
     order by data_combinada desc, criado_em desc`,
    [uid, telefone],
  )
  return rows.map((l) => ({ aviso: mapear(l), nome_outra_ponta: l.nome_outra_ponta }))
}

/**
 * Autocomplete ao criar (H15.6): nomes/números já usados em combinados que EU CRIEI e cujo
 * número da outra ponta bate com o prefixo digitado. Match por prefixo (LIKE), telefone no
 * CORPO (nunca em rota/log). distinct (telefone, nome); teto de 8 sugestões. Isolamento por uid.
 */
export async function buscarPorPrefixoTelefone(
  pool: Pool,
  uid: string,
  prefixo: string,
): Promise<SugestaoPessoa[]> {
  const { rows } = await pool.query<SugestaoPessoa>(
    `select distinct on (telefone, nome) nome, telefone from (
       select nome_devedor as nome, telefone_devedor as telefone
         from public.avisos
        where criador_papel='cobrador' and cobrador_id=$1 and telefone_devedor like $2
       union all
       select coalesce(nome_cobrador, nome_devedor) as nome, telefone_cobrador as telefone
         from public.avisos
        where criador_papel='devedor' and devedor_profile_id=$1 and telefone_cobrador like $2
     ) s
     where telefone is not null and nome <> ''
     order by telefone, nome
     limit 8`,
    [uid, `${prefixo}%`],
  )
  return rows
}
