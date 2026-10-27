// Acesso a dados do modulo: SO via @whaviso/shared/db, sempre com sql`...` (parametrizado).
// Toda query filtra por loja_id (escopo vem do servidor, nunca do corpo).
import { consultar, consultarUm, sql, sqlBruto, type Executor } from '@whaviso/shared/db'
import type {
  StatusConversa,
  DirecaoMensagem,
  TipoMensagem,
  AutorMensagem,
  StatusPedido,
} from '@whaviso/shared/contracts'
import type { PosicaoCursor } from './cursor'

// Instante com microssegundos preservados (cursor exato; Date do JS trunca em ms).
export const TS_PRECISO = (col: string) =>
  `to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

// "Nao lida" derivada (decisao da Onda 1): entrada mais recente que a ultima saida.
const NAO_LIDAS = `(select count(*)::int from public.mensagens mn
   where mn.conversa_id = c.id and mn.direcao = 'entrada'
     and mn.criado_em > coalesce((select max(ms.criado_em) from public.mensagens ms
                                   where ms.conversa_id = c.id and ms.direcao = 'saida'), '-infinity'::timestamptz))`

export interface LinhaConversa {
  id: string
  status: StatusConversa
  ultima_entrada_em: Date | null
  atualizado_em: Date
  criado_em: Date
  humano_desde: Date | null
  cliente_id: string
  cliente_nome: string | null
  telefone_hash: string
  nao_lidas: number
  cursor_t: string
  numero_id: string
  numero_status: 'conectado' | 'pausado' | 'removido'
  prev_previa: string | null
  prev_direcao: DirecaoMensagem | null
  prev_tipo: TipoMensagem | null
  prev_criado_em: Date | null
}

const COLUNAS = `c.id, c.status, c.ultima_entrada_em, c.atualizado_em, c.criado_em, c.humano_desde,
  c.cliente_id, cl.nome as cliente_nome, cl.telefone_hash, ${NAO_LIDAS} as nao_lidas,
  ${TS_PRECISO('c.atualizado_em')} as cursor_t, nw.id as numero_id, nw.status as numero_status,
  lm.previa as prev_previa, lm.direcao as prev_direcao, lm.tipo as prev_tipo, lm.criado_em as prev_criado_em`

const JUNCOES = `from public.conversas c
  join public.clientes cl on cl.id = c.cliente_id and cl.loja_id = c.loja_id
  join public.numeros_whatsapp nw on nw.id = c.numero_whatsapp_id and nw.loja_id = c.loja_id
  left join lateral (select left(coalesce(m.conteudo, m.transcricao), 80) as previa, m.direcao, m.tipo, m.criado_em
                       from public.mensagens m where m.conversa_id = c.id
                      order by m.criado_em desc, m.id desc limit 1) lm on true`

export interface FiltroLista {
  status?: StatusConversa
  busca?: string
  cursor?: PosicaoCursor
  limite: number
}

const escaparLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

export async function listarConversas(
  exec: Executor,
  lojaId: string,
  f: FiltroLista,
): Promise<LinhaConversa[]> {
  const porStatus = f.status ? sql`and c.status = ${f.status}` : sqlBruto('')
  const porBusca = f.busca
    ? sql`and cl.nome ilike ${'%' + escaparLike(f.busca) + '%'} escape '\\'`
    : sqlBruto('')
  const porCursor = f.cursor
    ? sql`and (c.atualizado_em, c.id) < (${f.cursor.instante}::timestamptz, ${f.cursor.id}::uuid)`
    : sqlBruto('')
  return consultar<LinhaConversa>(
    exec,
    sql`select ${sqlBruto(COLUNAS)} ${sqlBruto(JUNCOES)}
         where c.loja_id = ${lojaId} ${porStatus} ${porBusca} ${porCursor}
         order by c.atualizado_em desc, c.id desc limit ${f.limite + 1}`,
  )
}

export async function buscarConversa(
  exec: Executor,
  lojaId: string,
  conversaId: string,
): Promise<LinhaConversa | null> {
  return consultarUm<LinhaConversa>(
    exec,
    sql`select ${sqlBruto(COLUNAS)} ${sqlBruto(JUNCOES)} where c.loja_id = ${lojaId} and c.id = ${conversaId}`,
  )
}

export interface PedidoLigadoLinha {
  id: string
  codigo: string
  status: StatusPedido
}

export async function pedidoDaConversa(
  exec: Executor,
  lojaId: string,
  conversaId: string,
): Promise<PedidoLigadoLinha | null> {
  return consultarUm<PedidoLigadoLinha>(
    exec,
    sql`select id, codigo, status from public.pedidos
         where loja_id = ${lojaId} and conversa_id = ${conversaId}
         order by criado_em desc, id desc limit 1`,
  )
}

export interface LinhaMensagem {
  id: string
  conversa_id: string
  direcao: DirecaoMensagem
  autor: AutorMensagem
  tipo: TipoMensagem
  conteudo: string | null
  transcricao: string | null
  midia_ref: string | null
  criado_em: Date
  cursor_t: string
}

export const COLS_MSG = `m.id, m.conversa_id, m.direcao, m.autor, m.tipo, m.conteudo, m.transcricao, m.midia_ref,
  m.criado_em, ${TS_PRECISO('m.criado_em')} as cursor_t`

/** Mais recentes primeiro (o service reordena para cronologico); cursor = pagina anterior. */
export async function listarMensagens(
  exec: Executor,
  lojaId: string,
  conversaId: string,
  limite: number,
  cursor?: PosicaoCursor,
): Promise<LinhaMensagem[]> {
  const porCursor = cursor
    ? sql`and (m.criado_em, m.id) < (${cursor.instante}::timestamptz, ${cursor.id}::uuid)`
    : sqlBruto('')
  return consultar<LinhaMensagem>(
    exec,
    sql`select ${sqlBruto(COLS_MSG)} from public.mensagens m
         where m.loja_id = ${lojaId} and m.conversa_id = ${conversaId} ${porCursor}
         order by m.criado_em desc, m.id desc limit ${limite + 1}`,
  )
}
