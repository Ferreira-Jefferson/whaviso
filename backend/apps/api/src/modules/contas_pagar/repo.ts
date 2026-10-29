// Leitura do modulo contas a pagar: SO via @whaviso/shared/db, sempre com sql`...` (parametrizado).
// Tudo filtra por loja_id (multi-tenant). Nunca seleciona telefone em claro (so o cifrado). O nome
// do credor vem por read-model (LEFT JOIN em fornecedores/pessoas), sem importar aqueles modulos.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)
const DIA = (col: string): Consulta => sqlBruto(`to_char(${col}, 'YYYY-MM-DD')`)

export interface FornecedorLinha {
  id: string
  nome: string
  documento: string | null
  telefone_cifrado: Buffer | null
  observacoes: string | null
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

const COLS_FORNECEDOR = sql`id, nome, documento, telefone_cifrado, observacoes, ativo,
  ${TS('criado_em')} as criado_em, ${TS('atualizado_em')} as atualizado_em`

export async function listarFornecedores(exec: Executor, lojaId: string, incluirInativos: boolean) {
  const filtroAtivo = incluirInativos ? sqlBruto('') : sql` and ativo`
  return consultar<FornecedorLinha>(
    exec,
    sql`select ${COLS_FORNECEDOR} from public.fornecedores
         where loja_id = ${lojaId}${filtroAtivo}
         order by ativo desc, nome`,
  )
}

export async function obterFornecedor(exec: Executor, lojaId: string, id: string) {
  return consultarUm<FornecedorLinha>(
    exec,
    sql`select ${COLS_FORNECEDOR} from public.fornecedores where id = ${id} and loja_id = ${lojaId}`,
  )
}

/** Credor fornecedor valido para lancamento: existe, e da loja (traz `ativo` para a regra). */
export async function fornecedorDaLoja(exec: Executor, lojaId: string, id: string) {
  return consultarUm<{ id: string; ativo: boolean }>(
    exec,
    sql`select id, ativo from public.fornecedores where id = ${id} and loja_id = ${lojaId}`,
  )
}

/** Credor pessoa valido para lancamento: existe e e da loja (read-model; nao importa pessoas). */
export async function pessoaDaLoja(exec: Executor, lojaId: string, id: string) {
  return consultarUm<{ id: string; ativo: boolean }>(
    exec,
    sql`select id, ativo from public.pessoas where id = ${id} and loja_id = ${lojaId}`,
  )
}

export interface ContaPagarLinha {
  id: string
  credor_tipo: 'fornecedor' | 'pessoa'
  credor_id: string
  credor_nome: string
  descricao: string
  valor_centavos: number
  vencimento: string | null
  competencia: string | null
  status: 'a_pagar' | 'pago'
  pago_em: string | null
  criado_em: string
}

// credor_id/credor_nome vem da FK coerente (a constraint garante exatamente uma preenchida).
const COLS_CONTA = sql`c.id, c.credor_tipo,
  coalesce(c.fornecedor_id, c.pessoa_id) as credor_id,
  coalesce(f.nome, p.nome) as credor_nome,
  c.descricao, c.valor_centavos,
  ${DIA('c.vencimento')} as vencimento, ${DIA('c.competencia')} as competencia,
  c.status, ${TS('c.pago_em')} as pago_em, ${TS('c.criado_em')} as criado_em`

const JOIN_CREDOR = sql`from public.contas_pagar c
  left join public.fornecedores f on f.id = c.fornecedor_id
  left join public.pessoas p on p.id = c.pessoa_id`

export interface ContasFiltro {
  credorTipo?: 'fornecedor' | 'pessoa'
  status?: 'a_pagar' | 'pago'
  de?: string
  ate?: string
}

export async function listarContas(exec: Executor, lojaId: string, f: ContasFiltro) {
  const partes: Consulta[] = [sql`c.loja_id = ${lojaId}`]
  if (f.credorTipo !== undefined) partes.push(sql`c.credor_tipo = ${f.credorTipo}::credor_tipo`)
  if (f.status !== undefined) partes.push(sql`c.status = ${f.status}::status_conta_pagar`)
  if (f.de !== undefined) partes.push(sql`c.vencimento >= ${f.de}::date`)
  if (f.ate !== undefined) partes.push(sql`c.vencimento <= ${f.ate}::date`)
  const where = partes.reduce((acc, parte, i) => (i === 0 ? parte : sql`${acc} and ${parte}`))
  return consultar<ContaPagarLinha>(
    exec,
    sql`select ${COLS_CONTA} ${JOIN_CREDOR}
         where ${where}
         order by c.vencimento desc nulls last, c.criado_em desc
         limit 200`,
  )
}

export async function obterConta(exec: Executor, lojaId: string, id: string) {
  return consultarUm<ContaPagarLinha>(
    exec,
    sql`select ${COLS_CONTA} ${JOIN_CREDOR}
         where c.id = ${id} and c.loja_id = ${lojaId}`,
  )
}

// --- Acerto do motoboy por periodo (read-model sobre motoboys + motoboy_lancamentos + acertos) ---

/** Motoboy da loja (read-model; nao importa o modulo motoboys). So valida existencia/escopo. */
export async function motoboyDaLoja(exec: Executor, lojaId: string, id: string) {
  return consultarUm<{ id: string }>(
    exec,
    sql`select id from public.motoboys where loja_id = ${lojaId} and id = ${id}`,
  )
}

/** true quando algum acerto PAGO do motoboy cobre a `data` (dia de negocio). */
export async function acertoPagoCobre(
  exec: Executor, lojaId: string, motoboyId: string, data: string,
): Promise<boolean> {
  const r = await consultarUm<{ existe: boolean }>(
    exec,
    sql`select exists (
          select 1 from public.acertos_motoboy
           where loja_id = ${lojaId} and motoboy_id = ${motoboyId} and status = 'pago'
             and ${data}::date between periodo_inicio and periodo_fim
        ) as existe`,
  )
  return r?.existe ?? false
}

/** true quando algum acerto PAGO do motoboy SOBREPOE [de,ate] (anti dupla contagem). */
export async function acertoPagoSobrepoe(
  exec: Executor, lojaId: string, motoboyId: string, de: string, ate: string,
): Promise<boolean> {
  const r = await consultarUm<{ existe: boolean }>(
    exec,
    sql`select exists (
          select 1 from public.acertos_motoboy
           where loja_id = ${lojaId} and motoboy_id = ${motoboyId} and status = 'pago'
             and not (periodo_fim < ${de}::date or periodo_inicio > ${ate}::date)
        ) as existe`,
  )
  return r?.existe ?? false
}

/** Agregado cru de UM motoboy no periodo (regime + contagens do ledger). Totais derivados no service. */
export interface AcertoAgregadoDb {
  motoboy_id: string
  motoboy_nome: string
  regime_pagamento: 'por_entrega' | 'fixo' | 'fixo_mais_entrega'
  periodicidade_fixo: 'dia' | 'mes'
  valor_fixo_centavos: number
  qtd_entregas: number
  dias_trabalhados: number
  entregas_centavos: number
  ajustes_centavos: number
  pago: boolean
}

// Totais sempre DERIVADOS do ledger (float8 evita overflow de int4 na soma). A parcela fixa e o total
// sao calculados no service (regime). `pago` = o periodo sobrepoe um acerto ja PAGO do motoboy.
// `total_lanc` conta qualquer lancamento no periodo (entrega + ajuste) para o criterio de inclusao.
const acertoAgregadoBase = (de: string, ate: string): Consulta => sql`
  select m.id as motoboy_id, coalesce(p.nome, m.nome) as motoboy_nome,
         m.regime_pagamento, m.periodicidade_fixo, m.valor_fixo_centavos,
         coalesce(a.qtd, 0)::int as qtd_entregas,
         coalesce(a.dias, 0)::int as dias_trabalhados,
         coalesce(a.entregas, 0)::float8 as entregas_centavos,
         coalesce(a.ajustes, 0)::float8 as ajustes_centavos,
         coalesce(a.total_lanc, 0)::int as total_lanc,
         exists (
           select 1 from public.acertos_motoboy ac
            where ac.loja_id = m.loja_id and ac.motoboy_id = m.id and ac.status = 'pago'
              and not (ac.periodo_fim < ${de}::date or ac.periodo_inicio > ${ate}::date)
         ) as pago
    from public.motoboys m
    left join public.pessoas p on p.id = m.pessoa_id and p.loja_id = m.loja_id
    left join lateral (
      select count(*) filter (where l.tipo = 'entrega') as qtd,
             count(distinct l.data) filter (where l.tipo = 'entrega') as dias,
             sum(l.valor_centavos) filter (where l.tipo = 'entrega') as entregas,
             sum(l.valor_centavos) filter (where l.tipo = 'ajuste') as ajustes,
             count(*) as total_lanc
        from public.motoboy_lancamentos l
       where l.motoboy_id = m.id and l.loja_id = m.loja_id
         and l.data between ${de}::date and ${ate}::date
    ) a on true`

/** Agregados de todos os motoboys relevantes da loja no periodo. */
export function acertosDoPeriodo(exec: Executor, lojaId: string, de: string, ate: string) {
  return consultar<AcertoAgregadoDb>(
    exec,
    sql`${acertoAgregadoBase(de, ate)}
         where m.loja_id = ${lojaId}
           and (a.total_lanc > 0 or (m.ativo and m.regime_pagamento <> 'por_entrega'))
         order by motoboy_nome, m.id`,
  )
}

/** Agregado de UM motoboy no periodo (usado ao pagar, para recomputar o total dentro da transacao). */
export function acertoDoMotoboy(exec: Executor, lojaId: string, motoboyId: string, de: string, ate: string) {
  return consultarUm<AcertoAgregadoDb>(
    exec,
    sql`${acertoAgregadoBase(de, ate)}
         where m.loja_id = ${lojaId} and m.id = ${motoboyId}`,
  )
}

export interface AcertoLancamentoDb {
  id: string
  motoboy_id: string
  data: string
  tipo: 'entrega' | 'ajuste'
  pedido_id: string | null
  valor_centavos: number
  descricao: string | null
  criado_em: string
}

/** Lancamentos (entrega + ajuste) de todos os motoboys da loja no periodo, para anexar por motoboy. */
export function lancamentosDoPeriodo(exec: Executor, lojaId: string, de: string, ate: string) {
  return consultar<AcertoLancamentoDb>(
    exec,
    sql`select l.id::text as id, l.motoboy_id, ${DIA('l.data')} as data, l.tipo, l.pedido_id,
               l.valor_centavos, l.descricao, ${TS('l.criado_em')} as criado_em
          from public.motoboy_lancamentos l
         where l.loja_id = ${lojaId} and l.data between ${de}::date and ${ate}::date
         order by l.motoboy_id, l.id`,
  )
}
