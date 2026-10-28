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
         order by c.vencimento desc nulls last, c.criado_em desc`,
  )
}

export async function obterConta(exec: Executor, lojaId: string, id: string) {
  return consultarUm<ContaPagarLinha>(
    exec,
    sql`select ${COLS_CONTA} ${JOIN_CREDOR}
         where c.id = ${id} and c.loja_id = ${lojaId}`,
  )
}
