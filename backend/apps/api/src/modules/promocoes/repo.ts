// Acesso a dados do modulo: SO via @whaviso/shared/db, sempre com sql`...` (parametrizado).
// Toda consulta filtra por loja_id. Cardapio (itens), clientes e pedidos so sao LIDOS por SQL
// proprio (sem importar os modulos donos). Nenhuma coluna de PII.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type { TipoPromocao } from './calculo'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

export interface PromocaoLinha {
  id: string
  nome: string
  tipo: TipoPromocao
  codigo: string | null
  valor: number
  inicio_em: string | null
  fim_em: string | null
  limite_total: number | null
  limite_por_cliente: number | null
  min_pedido_centavos: number
  desconto_maximo_centavos: number | null
  ativo: boolean
  usos_total: number
  criado_em: string
}

const COLUNAS = sql`p.id, p.nome, p.tipo, p.codigo, p.valor, ${TS('p.inicio_em')} as inicio_em,
  ${TS('p.fim_em')} as fim_em, p.limite_total, p.limite_por_cliente, p.min_pedido_centavos,
  p.desconto_maximo_centavos, p.ativo, ${TS('p.criado_em')} as criado_em,
  (select count(*)::int from public.promocao_usos u where u.promocao_id = p.id) as usos_total`

export interface FiltroLista {
  ativo?: boolean
  tipo?: string
  cursor?: { ts: string; id: string }
  limite: number
}

export async function listar(exec: Executor, lojaId: string, f: FiltroLista) {
  const ativo = f.ativo === undefined ? sqlBruto('') : sql` and p.ativo = ${f.ativo}`
  const tipo = f.tipo ? sql` and p.tipo = ${f.tipo}::tipo_promocao` : sqlBruto('')
  const cursor = f.cursor
    ? sql` and (p.criado_em, p.id) < (${f.cursor.ts}::timestamptz, ${f.cursor.id}::uuid)`
    : sqlBruto('')
  return consultar<PromocaoLinha>(
    exec,
    sql`select ${COLUNAS}
          from public.promocoes p
         where p.loja_id = ${lojaId}${ativo}${tipo}${cursor}
         order by p.criado_em desc, p.id desc
         limit ${f.limite + 1}`,
  )
}

export async function obter(exec: Executor, lojaId: string, id: string, travar = false) {
  const lock = travar ? sqlBruto(' for update of p') : sqlBruto('')
  return consultarUm<PromocaoLinha>(
    exec,
    sql`select ${COLUNAS} from public.promocoes p where p.id = ${id} and p.loja_id = ${lojaId}${lock}`,
  )
}

export async function obterPorCodigo(exec: Executor, lojaId: string, codigo: string) {
  return consultarUm<PromocaoLinha>(
    exec,
    sql`select ${COLUNAS} from public.promocoes p where p.loja_id = ${lojaId} and p.codigo = ${codigo}`,
  )
}

export async function itensDaPromocao(exec: Executor, lojaId: string, ids: string[]) {
  if (ids.length === 0) return []
  return consultar<{ promocao_id: string; item_id: string; quantidade: number }>(
    exec,
    sql`select promocao_id, item_id, quantidade from public.promocao_itens
         where loja_id = ${lojaId} and promocao_id = any(${ids}::uuid[]) order by item_id`,
  )
}

/** Quantos dos itens informados existem na loja (leitura de cardapio por SQL). */
export async function contarItensDaLoja(exec: Executor, lojaId: string, itemIds: string[]) {
  const r = await consultarUm<{ n: number }>(
    exec,
    sql`select count(*)::int as n from public.itens where loja_id = ${lojaId} and id = any(${itemIds}::uuid[])`,
  )
  return r?.n ?? 0
}

export async function clienteExiste(exec: Executor, lojaId: string, id: string) {
  return (await consultarUm(exec, sql`select 1 as ok from public.clientes where id = ${id} and loja_id = ${lojaId}`)) !== null
}

export async function pedidoExiste(exec: Executor, lojaId: string, id: string) {
  return (await consultarUm(exec, sql`select 1 as ok from public.pedidos where id = ${id} and loja_id = ${lojaId}`)) !== null
}

export interface NovaPromocao {
  nome: string
  tipo: string
  codigo: string | null
  valor: number
  inicio_em: string | null
  fim_em: string | null
  limite_total: number | null
  limite_por_cliente: number | null
  min_pedido_centavos: number
  desconto_maximo_centavos: number | null
  ativo: boolean
}

export async function inserir(exec: Executor, lojaId: string, userId: string, d: NovaPromocao) {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.promocoes
          (loja_id, nome, tipo, codigo, valor, inicio_em, fim_em, limite_total, limite_por_cliente,
           min_pedido_centavos, desconto_maximo_centavos, ativo, criado_por_user_id)
        values (${lojaId}, ${d.nome}, ${d.tipo}::tipo_promocao, ${d.codigo}, ${d.valor},
                ${d.inicio_em}::timestamptz, ${d.fim_em}::timestamptz, ${d.limite_total},
                ${d.limite_por_cliente}, ${d.min_pedido_centavos}, ${d.desconto_maximo_centavos},
                ${d.ativo}, ${userId})
        returning id`,
  )
  return r!.id
}

export async function inserirItem(
  exec: Executor,
  lojaId: string,
  promocaoId: string,
  i: { item_id: string; quantidade: number },
) {
  await consultar(
    exec,
    sql`insert into public.promocao_itens (promocao_id, loja_id, item_id, quantidade)
        values (${promocaoId}, ${lojaId}, ${i.item_id}, ${i.quantidade})`,
  )
}

const TIPO_COLUNA: Record<string, string> = {
  nome: 'text', valor: 'integer', inicio_em: 'timestamptz', fim_em: 'timestamptz',
  limite_total: 'integer', limite_por_cliente: 'integer', min_pedido_centavos: 'integer',
  desconto_maximo_centavos: 'integer', ativo: 'boolean',
}

/** Atualiza so os campos presentes (coluna vem de lista fixa; valores parametrizados). */
export async function atualizar(
  exec: Executor,
  lojaId: string,
  id: string,
  campos: Record<string, string | number | boolean | null>,
) {
  const partes = Object.entries(campos).map(([k, v]) => {
    const tipo = TIPO_COLUNA[k]
    if (!tipo) throw new Error('campo de promocao nao atualizavel')
    return sql`${sqlBruto(k)} = ${v}::${sqlBruto(tipo)}`
  })
  if (partes.length === 0) return
  let set = partes[0]!
  for (const p of partes.slice(1)) set = sql`${set}, ${p}`
  await consultar(exec, sql`update public.promocoes set ${set} where id = ${id} and loja_id = ${lojaId}`)
}

export async function contarUsos(exec: Executor, promocaoId: string, clienteId: string | null) {
  const r = await consultarUm<{ total: number; cliente: number }>(
    exec,
    sql`select count(*)::int as total,
               (count(*) filter (where ${clienteId}::uuid is not null and cliente_id = ${clienteId}::uuid))::int as cliente
          from public.promocao_usos where promocao_id = ${promocaoId}`,
  )
  return { total: r?.total ?? 0, cliente: r?.cliente ?? 0 }
}

export async function usoExistente(exec: Executor, promocaoId: string, pedidoId: string) {
  return consultarUm<{ id: string; desconto_centavos: number }>(
    exec,
    sql`select id, desconto_centavos from public.promocao_usos where promocao_id = ${promocaoId} and pedido_id = ${pedidoId}`,
  )
}

export async function inserirUso(
  exec: Executor,
  d: { promocaoId: string; lojaId: string; pedidoId: string; clienteId: string | null; desconto: number },
) {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.promocao_usos (promocao_id, loja_id, pedido_id, cliente_id, desconto_centavos)
        values (${d.promocaoId}, ${d.lojaId}, ${d.pedidoId}, ${d.clienteId}, ${d.desconto})
        returning id`,
  )
  return r!.id
}

export async function registrarEvento(
  exec: Executor,
  e: { lojaId: string; tipo: string; entidadeId: string; userId: string },
) {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, ${e.tipo}, 'promocao', ${e.entidadeId}, 'loja',
                ${JSON.stringify({ user_id: e.userId })}::jsonb)`,
  )
}
