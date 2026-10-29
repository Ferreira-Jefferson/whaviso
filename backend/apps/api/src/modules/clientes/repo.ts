// Acesso a dados do modulo: SO via @whaviso/shared/db, sempre com sql`...` (parametrizado).
// Toda consulta filtra por loja_id (cliente e por loja). Nunca seleciona telefone_hash.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type { EnderecoDto, EnderecoNovo, EnderecoPatch } from './schemas'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

export interface ClienteLinha {
  id: string
  nome: string | null
  telefone_cifrado: Buffer | null
  criado_em: string
}
export interface ClienteListaLinha extends ClienteLinha {
  pedidos_total: number
  ultima: string
}

export interface FiltroLista {
  nome?: string
  hash?: string
  cursor?: { ts: string; id: string }
  limite: number
}

function escaparLike(v: string): string {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export async function listar(exec: Executor, lojaId: string, f: FiltroLista) {
  const porNome = f.nome
    ? sql` and c.nome ilike ${`%${escaparLike(f.nome)}%`} escape ${'\\'}`
    : sqlBruto('')
  const porHash = f.hash ? sql` and c.telefone_hash = ${f.hash}` : sqlBruto('')
  // Read-model: pedidos_total e ordenado_em sao colunas prontas (mantidas por trigger no pedidos,
  // migration 0083), entao a listagem nao faz mais o lateral por linha. `ordenado_em` (coluna gerada
  // = greatest(criado_em, coalesce(ultimo_pedido_em, criado_em))) tem indice que serve o order by +
  // o cursor direto. A saida e identica a de antes (campos pedidos_total e ultima).
  const cursor = f.cursor
    ? sql` and (c.ordenado_em, c.id) < (${f.cursor.ts}::timestamptz, ${f.cursor.id}::uuid)`
    : sqlBruto('')
  return consultar<ClienteListaLinha>(
    exec,
    sql`select c.id, c.nome, c.telefone_cifrado, c.pedidos_total,
               ${TS('c.criado_em')} as criado_em, ${TS('c.ordenado_em')} as ultima
          from public.clientes c
         where c.loja_id = ${lojaId}${porNome}${porHash}${cursor}
         order by c.ordenado_em desc, c.id desc
         limit ${f.limite + 1}`,
  )
}

export async function obter(exec: Executor, lojaId: string, id: string) {
  return consultarUm<ClienteLinha>(
    exec,
    sql`select id, nome, telefone_cifrado, ${TS('criado_em')} as criado_em
          from public.clientes where id = ${id} and loja_id = ${lojaId}`,
  )
}

export async function achaPorHash(exec: Executor, lojaId: string, hash: string) {
  return consultarUm<{ id: string }>(
    exec,
    sql`select id from public.clientes where loja_id = ${lojaId} and telefone_hash = ${hash}`,
  )
}

export async function inserirCliente(
  exec: Executor,
  lojaId: string,
  d: { hash: string; cifrado: Buffer; nome: string | null },
) {
  return consultarUm<ClienteLinha>(
    exec,
    sql`insert into public.clientes (loja_id, telefone_hash, telefone_cifrado, nome)
        values (${lojaId}, ${d.hash}, ${d.cifrado}, ${d.nome})
        on conflict (loja_id, telefone_hash) do nothing
        returning id, nome, telefone_cifrado, ${TS('criado_em')} as criado_em`,
  )
}

export async function atualizarNome(exec: Executor, lojaId: string, id: string, nome: string) {
  return consultarUm<ClienteLinha>(
    exec,
    sql`update public.clientes set nome = ${nome} where id = ${id} and loja_id = ${lojaId}
        returning id, nome, telefone_cifrado, ${TS('criado_em')} as criado_em`,
  )
}

export async function resumoPedidos(exec: Executor, lojaId: string, id: string) {
  const r = await consultarUm<{ total: number; ultimo: string | null; gasto: number }>(
    exec,
    // total e ultimo vem do read-model em `clientes` (0083, mantido por trigger); so o gasto soma.
    sql`select c.pedidos_total as total, ${TS('c.ultimo_pedido_em')} as ultimo,
               (select coalesce(sum(p.total_centavos), 0)::int from public.pedidos p
                 where p.cliente_id = c.id and p.loja_id = c.loja_id and p.status <> 'rascunho') as gasto
          from public.clientes c
         where c.id = ${id} and c.loja_id = ${lojaId}`,
  )
  return {
    total: r?.total ?? 0,
    ultimo_pedido_em: r?.ultimo ?? null,
    total_gasto_centavos: r?.gasto ?? 0,
  }
}

const COLS_END = sqlBruto(`id, cliente_id, apelido, logradouro, numero, complemento, bairro, cidade,
  uf::text as uf, cep, referencia, ativo`)
const SAIDA_END = sql`${COLS_END}, ${TS('ultimo_uso_em')} as ultimo_uso_em, ${TS('criado_em')} as criado_em`

export async function listarEnderecos(exec: Executor, lojaId: string, clienteId: string) {
  return consultar<EnderecoDto>(
    exec,
    sql`select ${SAIDA_END} from public.enderecos
         where cliente_id = ${clienteId} and loja_id = ${lojaId} and ativo
         order by ultimo_uso_em desc nulls last, criado_em desc, id`,
  )
}

export async function ultimoEndereco(exec: Executor, lojaId: string, clienteId: string) {
  return consultarUm<EnderecoDto>(
    exec,
    sql`select ${SAIDA_END} from public.enderecos
         where cliente_id = ${clienteId} and loja_id = ${lojaId} and ativo and ultimo_uso_em is not null
         order by ultimo_uso_em desc, criado_em desc limit 1`,
  )
}

export async function obterEndereco(exec: Executor, lojaId: string, id: string) {
  return consultarUm<EnderecoDto>(
    exec,
    sql`select ${SAIDA_END} from public.enderecos where id = ${id} and loja_id = ${lojaId}`,
  )
}

export async function inserirEndereco(exec: Executor, lojaId: string, clienteId: string, e: EnderecoNovo) {
  const [linha] = await consultar<EnderecoDto>(
    exec,
    sql`insert into public.enderecos
          (loja_id, cliente_id, apelido, logradouro, numero, complemento, bairro, cidade, uf, cep, referencia)
        values (${lojaId}, ${clienteId}, ${e.apelido ?? null}, ${e.logradouro}, ${e.numero ?? null},
                ${e.complemento ?? null}, ${e.bairro ?? null}, ${e.cidade ?? null}, ${e.uf ?? null},
                ${e.cep ?? null}, ${e.referencia ?? null})
        returning ${SAIDA_END}`,
  )
  return linha!
}

const COLUNAS_EDITAVEIS = [
  'apelido', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep', 'referencia',
] as const

export async function atualizarEndereco(exec: Executor, lojaId: string, id: string, p: EnderecoPatch) {
  const partes = COLUNAS_EDITAVEIS.filter((c) => p[c] !== undefined).map(
    (c) => sql`${sqlBruto(c)} = ${p[c] ?? null}`,
  )
  const sets = partes.reduce((acc, parte, i) => (i === 0 ? parte : sql`${acc}, ${parte}`))
  return consultarUm<EnderecoDto>(
    exec,
    sql`update public.enderecos set ${sets} where id = ${id} and loja_id = ${lojaId} and ativo
        returning ${SAIDA_END}`,
  )
}

export async function desativarEndereco(exec: Executor, lojaId: string, id: string) {
  return consultarUm<EnderecoDto>(
    exec,
    sql`update public.enderecos set ativo = false where id = ${id} and loja_id = ${lojaId}
        returning ${SAIDA_END}`,
  )
}

/** Auditoria sem PII (tabela eventos). `detalhes` nunca recebe telefone, nome ou endereco. */
export async function registrarEvento(
  exec: Executor,
  e: { lojaId: string; tipo: string; entidade: string; entidadeId: string; userId: string },
) {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, ${e.tipo}, ${e.entidade}, ${e.entidadeId}, 'loja',
                ${JSON.stringify({ user_id: e.userId })}::jsonb)`,
  )
}
