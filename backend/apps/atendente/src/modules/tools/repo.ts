// Leitura de dados via SQL explicito sob o role `whaviso_atendente` (nao importa outros modulos).
// TODA consulta filtra por `loja_id` do ConversaCtx (e `cliente_id` quando e dado do cliente):
// a autorizacao esta no WHERE, nao no texto do modelo (SEC-063/064). Valores sempre parametrizados.
import { consultar, consultarUm, sql, type Executor } from '@whaviso/shared/db'

/** Escapa curingas do LIKE: o texto do cliente e literal, nunca padrao (SEC-065). */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export interface ItemLinha {
  id: string
  nome: string
  descricao: string | null
  categoria: string
  preco_centavos: number
  disponivel: boolean
}

export function buscarItens(
  exec: Executor,
  lojaId: string,
  filtro: { consulta?: string; categoria?: string; limite: number },
): Promise<ItemLinha[]> {
  const q = filtro.consulta ? `%${escaparLike(filtro.consulta)}%` : null
  const cat = filtro.categoria ? `%${escaparLike(filtro.categoria)}%` : null
  return consultar<ItemLinha>(
    exec,
    sql`select i.id, i.nome, i.descricao, c.nome as categoria, i.preco_centavos,
               (i.esgotado_ate is null or i.esgotado_ate <= now()) as disponivel
          from public.itens i
          join public.categorias c on c.id = i.categoria_id and c.loja_id = i.loja_id
         where i.loja_id = ${lojaId} and i.ativo and c.ativo
           and (${q}::text is null or i.nome ilike ${q} or coalesce(i.descricao, '') ilike ${q})
           and (${cat}::text is null or c.nome ilike ${cat})
         order by c.ordem, i.ordem, i.nome
         limit ${filtro.limite}`,
  )
}

export interface ItemRef {
  id: string
  nome: string
  preco_centavos: number
}
/** Itens ATIVOS e DISPONIVEIS da loja entre os ids dados (ids de outra loja nao voltam). */
export function itensDaLoja(exec: Executor, lojaId: string, ids: string[]): Promise<ItemRef[]> {
  return consultar<ItemRef>(
    exec,
    sql`select i.id, i.nome, i.preco_centavos
          from public.itens i
          join public.categorias c on c.id = i.categoria_id and c.loja_id = i.loja_id
         where i.loja_id = ${lojaId} and i.id = any(${ids}::uuid[]) and i.ativo and c.ativo
           and (i.esgotado_ate is null or i.esgotado_ate <= now())`,
  )
}

/** Opcoes ATIVAS e DISPONIVEIS da loja entre os ids dados. */
export function opcoesDaLoja(exec: Executor, lojaId: string, ids: string[]): Promise<ItemRef[]> {
  return consultar<ItemRef>(
    exec,
    sql`select o.id, o.nome, o.preco_centavos
          from public.opcoes o
          join public.grupos_opcoes g on g.id = o.grupo_id and g.loja_id = o.loja_id
         where o.loja_id = ${lojaId} and o.id = any(${ids}::uuid[]) and o.ativo and g.ativo
           and (o.esgotado_ate is null or o.esgotado_ate <= now())`,
  )
}

export function lerClienteBasico(exec: Executor, lojaId: string, clienteId: string): Promise<{ nome: string | null } | null> {
  return consultarUm<{ nome: string | null }>(
    exec,
    sql`select nome from public.clientes where id = ${clienteId} and loja_id = ${lojaId}`,
  )
}

export function lerUltimoEnderecoAtivo(
  exec: Executor,
  lojaId: string,
  clienteId: string,
): Promise<{ id: string; logradouro: string; numero: string | null; bairro: string | null } | null> {
  return consultarUm(
    exec,
    sql`select id, logradouro, numero, bairro from public.enderecos
         where loja_id = ${lojaId} and cliente_id = ${clienteId} and ativo
         order by ultimo_uso_em desc nulls last, criado_em desc limit 1`,
  )
}

export interface PedidoLinha {
  codigo: string
  status: string
  total_centavos: number
  criado_em: Date
}
/** Pedidos REAIS (fora de rascunho) do cliente da conversa, mais recentes primeiro. */
export function lerPedidosDoCliente(
  exec: Executor,
  lojaId: string,
  clienteId: string,
  filtro: { codigo?: string; limite: number },
): Promise<PedidoLinha[]> {
  const codigo = filtro.codigo ?? null
  return consultar<PedidoLinha>(
    exec,
    sql`select codigo, status::text as status, total_centavos, criado_em
          from public.pedidos
         where loja_id = ${lojaId} and cliente_id = ${clienteId} and status <> 'rascunho'
           and (${codigo}::text is null or codigo = ${codigo})
         order by criado_em desc limit ${filtro.limite}`,
  )
}
