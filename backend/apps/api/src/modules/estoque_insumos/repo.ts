// Acesso a dados do modulo: SO via @whaviso/shared/db, sempre com sql`...` (parametrizado).
// Toda consulta filtra por loja_id (insumo e por loja). Quantidades voltam como numero (::float8).
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type { InsumoDto, InsumoNovo, InsumoPatch, MovimentoInsumoDto } from './schemas'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

// numeric(14,3) -> numero JS (exato ate 3 casas); comparacoes de saldo ficam no SQL (numeric).
const COLS_INSUMO = sql`id, nome, unidade,
  quantidade_atual::float8  as quantidade_atual,
  quantidade_minima::float8 as quantidade_minima,
  custo_unitario_centavos, ativo,
  (quantidade_atual <= quantidade_minima) as abaixo_minimo,
  ${TS('criado_em')} as criado_em, ${TS('atualizado_em')} as atualizado_em`

const COLS_MOV = sql`id, insumo_id, tipo,
  quantidade::float8 as quantidade, quantidade_resultante::float8 as quantidade_resultante,
  motivo, pedido_id, criado_por_user_id, ${TS('criado_em')} as criado_em`

export async function listar(exec: Executor, lojaId: string, incluirInativos: boolean) {
  const filtroAtivo = incluirInativos ? sqlBruto('') : sql` and ativo`
  return consultar<InsumoDto>(
    exec,
    sql`select ${COLS_INSUMO} from public.insumos
         where loja_id = ${lojaId}${filtroAtivo}
         order by abaixo_minimo desc, nome asc, id`,
  )
}

export async function listarBaixoEstoque(exec: Executor, lojaId: string) {
  return consultar<InsumoDto>(
    exec,
    sql`select ${COLS_INSUMO} from public.insumos
         where loja_id = ${lojaId} and ativo and quantidade_atual <= quantidade_minima
         order by (quantidade_atual - quantidade_minima) asc, nome asc, id`,
  )
}

export async function obter(exec: Executor, lojaId: string, id: string) {
  return consultarUm<InsumoDto>(
    exec,
    sql`select ${COLS_INSUMO} from public.insumos where id = ${id} and loja_id = ${lojaId}`,
  )
}

/** SELECT ... FOR UPDATE: trava a linha na transacao de um movimento. */
export async function obterParaMovimento(exec: Executor, lojaId: string, id: string) {
  return consultarUm<{ id: string }>(
    exec,
    sql`select id from public.insumos where id = ${id} and loja_id = ${lojaId} for update`,
  )
}

export async function inserir(exec: Executor, lojaId: string, d: InsumoNovo) {
  const r = await consultarUm<InsumoDto>(
    exec,
    sql`insert into public.insumos
          (loja_id, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario_centavos)
        values (${lojaId}, ${d.nome}, ${d.unidade}, ${d.quantidade_inicial}, ${d.quantidade_minima},
                ${d.custo_unitario_centavos ?? null})
        returning ${COLS_INSUMO}`,
  )
  return r!
}

const COLUNAS_EDITAVEIS = ['nome', 'unidade', 'quantidade_minima', 'custo_unitario_centavos', 'ativo'] as const

export async function atualizar(exec: Executor, lojaId: string, id: string, p: InsumoPatch) {
  const partes = COLUNAS_EDITAVEIS.filter((c) => p[c] !== undefined).map(
    (c) => sql`${sqlBruto(c)} = ${p[c] ?? null}`,
  )
  const sets = partes.reduce((acc, parte, i) => (i === 0 ? parte : sql`${acc}, ${parte}`))
  return consultarUm<InsumoDto>(
    exec,
    sql`update public.insumos set ${sets} where id = ${id} and loja_id = ${lojaId}
        returning ${COLS_INSUMO}`,
  )
}

/** Aplica o delta no saldo com guarda no SQL (nunca negativo); null = guarda barrou. */
export async function somarSaldo(exec: Executor, lojaId: string, id: string, delta: number) {
  // delta >= 0 sobe; delta < 0 desce (so se houver saldo). Comparacao numeric-exata no SQL.
  return consultarUm<{ quantidade_resultante: number }>(
    exec,
    sql`update public.insumos
          set quantidade_atual = quantidade_atual + ${delta}
        where id = ${id} and loja_id = ${lojaId} and quantidade_atual + ${delta} >= 0
        returning quantidade_atual::float8 as quantidade_resultante`,
  )
}

/** Recontagem: define o saldo absoluto. */
export async function definirSaldo(exec: Executor, lojaId: string, id: string, valor: number) {
  return consultarUm<{ quantidade_resultante: number }>(
    exec,
    sql`update public.insumos set quantidade_atual = ${valor}
        where id = ${id} and loja_id = ${lojaId}
        returning quantidade_atual::float8 as quantidade_resultante`,
  )
}

export interface MovimentoInsert {
  lojaId: string
  insumoId: string
  tipo: 'entrada' | 'saida' | 'ajuste' | 'consumo'
  quantidade: number
  quantidadeResultante: number
  motivo?: string | null
  pedidoId?: string | null
  userId?: string | null
}

export async function inserirMovimento(exec: Executor, m: MovimentoInsert) {
  const r = await consultarUm<MovimentoInsumoDto>(
    exec,
    sql`insert into public.movimentos_insumo
          (loja_id, insumo_id, tipo, quantidade, quantidade_resultante, motivo, pedido_id, criado_por_user_id)
        values (${m.lojaId}, ${m.insumoId}, ${m.tipo}, ${m.quantidade}, ${m.quantidadeResultante},
                ${m.motivo ?? null}, ${m.pedidoId ?? null}, ${m.userId ?? null})
        returning ${COLS_MOV}`,
  )
  return r!
}

export async function listarMovimentos(exec: Executor, lojaId: string, insumoId: string, limite: number) {
  return consultar<MovimentoInsumoDto>(
    exec,
    sql`select ${COLS_MOV} from public.movimentos_insumo
         where insumo_id = ${insumoId} and loja_id = ${lojaId}
         order by criado_em desc, id desc
         limit ${limite}`,
  )
}

/** Auditoria sem PII (tabela eventos). `detalhes` so com ids/codigos. */
export async function registrarEvento(
  exec: Executor,
  e: { lojaId: string; tipo: string; entidadeId: string; userId: string },
) {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, ${e.tipo}, 'insumo', ${e.entidadeId}, 'loja',
                ${JSON.stringify({ user_id: e.userId })}::jsonb)`,
  )
}
