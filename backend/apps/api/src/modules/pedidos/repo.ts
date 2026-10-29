// Leitura de pedidos e read-models cruzados (cardapio, clientes, enderecos), SO via
// @whaviso/shared/db com sql`...` parametrizado. Toda consulta filtra por loja_id.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import { TZ } from '@whaviso/shared/datas'
import type { FormaPagamento, ModalidadePedido, OrigemPedido, StatusPedido } from '@whaviso/shared/contracts'
import type {
  CategoriaRow, GrupoRow, ItemRow, OpcaoRow, VinculoItemRow, VinculoRow,
} from './cardapio_leitura'
import type { CardapioLido } from './montador'

export const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

function agrupar<T>(linhas: readonly T[], chave: (l: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const l of linhas) {
    const k = chave(l)
    const a = m.get(k)
    if (a) a.push(l)
    else m.set(k, [l])
  }
  return m
}

// ------------------------------------------------------------ cardapio (read-model)
export async function lerCardapio(exec: Executor, lojaId: string, itemIds: string[]): Promise<CardapioLido> {
  const itens = await consultar<ItemRow>(
    exec,
    sql`select id, categoria_id, nome, preco_centavos, ativo, esgotado_ate,
               controla_estoque, quantidade_disponivel
          from public.itens where loja_id = ${lojaId} and id = any(${itemIds}::uuid[])`,
  )
  const catIds = [...new Set(itens.map((i) => i.categoria_id))]
  const categorias = await consultar<CategoriaRow & { id: string }>(
    exec,
    sql`select id, ativo, programacao from public.categorias
         where loja_id = ${lojaId} and id = any(${catIds}::uuid[])`,
  )
  const vincCat = await consultar<VinculoRow & { categoria_id: string }>(
    exec,
    sql`select categoria_id, grupo_id, ordem from public.categoria_grupos
         where loja_id = ${lojaId} and categoria_id = any(${catIds}::uuid[])`,
  )
  const vincItem = await consultar<VinculoItemRow>(
    exec,
    sql`select item_id, grupo_id, incluir, ordem from public.item_grupos
         where loja_id = ${lojaId} and item_id = any(${itemIds}::uuid[])`,
  )
  const grupos = await consultar<GrupoRow>(
    exec,
    sql`select id, nome, obrigatorio, min_escolhas::int as min_escolhas, max_escolhas::int as max_escolhas,
               aplica_a_opcao_id, ativo, ordem from public.grupos_opcoes where loja_id = ${lojaId}`,
  )
  const opcoes = await consultar<OpcaoRow>(
    exec,
    sql`select id, grupo_id, nome, preco_centavos, ativo, esgotado_ate
          from public.opcoes where loja_id = ${lojaId}`,
  )
  return {
    itens: new Map(itens.map((i) => [i.id, i])),
    categorias: new Map(categorias.map((c) => [c.id, c])),
    grupos: new Map(grupos.map((g) => [g.id, g])),
    opcoes: new Map(opcoes.map((o) => [o.id, o])),
    vinculosCategoria: agrupar(vincCat, (v) => v.categoria_id),
    vinculosItem: agrupar(vincItem, (v) => v.item_id),
  }
}

// ------------------------------------------------------------ clientes / enderecos (read-model)
export async function clienteDaLoja(exec: Executor, lojaId: string, id: string) {
  return consultarUm<{ id: string }>(
    exec, sql`select id from public.clientes where id = ${id} and loja_id = ${lojaId}`,
  )
}
export async function enderecoAtivoDoCliente(exec: Executor, lojaId: string, clienteId: string, id: string) {
  return consultarUm<{ id: string }>(
    exec,
    sql`select id from public.enderecos
         where id = ${id} and loja_id = ${lojaId} and cliente_id = ${clienteId} and ativo`,
  )
}

// ------------------------------------------------------------ loja (read-model p/ guarda de aceite)
export interface EstadoAceiteLoja {
  /** Pausa em vigor agora: pausada e (sem prazo ou prazo ainda no futuro). */
  pausada_agora: boolean
  pausada_motivo: string | null
  /** Teto de pedidos por janela (NULL = sem limite). */
  capacidade_por_janela: number | null
  /** Pedidos nao-rascunho criados na janela movel (ja descontado o teto). */
  pedidos_na_janela: number
}

/**
 * Estado da loja para decidir se aceita um pedido novo: pausa em vigor e ocupacao da janela movel.
 * Leitura cruzada do modulo pedidos sobre `lojas`/`pedidos` (sem importar o modulo lojas), sempre
 * escopada por loja. O rascunho nao conta para a capacidade (so pedido efetivado ocupa a janela).
 */
/** Serializa o aceite de pedido novo por loja: a checagem de pausa/capacidade e o insert caem na
 *  mesma tx, sem janela entre contar a ocupacao e gravar o pedido. */
export async function travarAceiteLoja(exec: Executor, lojaId: string): Promise<void> {
  await consultar(exec, sql`select pg_advisory_xact_lock(hashtext(${'aceite-loja:' + lojaId}))`)
}

export async function estadoAceiteLoja(exec: Executor, lojaId: string): Promise<EstadoAceiteLoja | null> {
  return consultarUm<EstadoAceiteLoja>(
    exec,
    sql`select
           (l.pausada and (l.pausada_ate is null or l.pausada_ate > now())) as pausada_agora,
           l.pausada_motivo,
           l.capacidade_por_janela,
           (select count(*)::int from public.pedidos p
             where p.loja_id = l.id and p.status <> 'rascunho'
               and p.criado_em > now() - make_interval(mins => l.capacidade_janela_minutos)) as pedidos_na_janela
         from public.lojas l
        where l.id = ${lojaId}`,
  )
}

// ------------------------------------------------------------ pedidos
export interface CardLinha {
  id: string
  codigo: string
  status: StatusPedido
  origem: OrigemPedido
  modalidade: ModalidadePedido
  total_centavos: number
  qtd_itens: number
  cliente_nome: string | null
  problema_motivo: string | null
  motoboy_nome: string | null
  corrida_id: string | null
  ordem_parada: number | null
  zona_id: string | null
  criado_em: string
  cursor_ts: string
}
export interface FiltroColuna {
  status: StatusPedido
  modalidade?: ModalidadePedido | undefined
  origem?: OrigemPedido | undefined
  data?: string | undefined
  cursor?: { ts: string; id: string } | undefined
  limite: number
}

/** Coluna do kanban: `entregue` mais recente primeiro; as demais, mais antigas primeiro (fila). */
export async function listarColuna(exec: Executor, lojaId: string, f: FiltroColuna) {
  const desc = f.status === 'entregue'
  const filtroMod = f.modalidade ? sql` and p.modalidade = ${f.modalidade}::modalidade_pedido` : sqlBruto('')
  const filtroOri = f.origem ? sql` and p.origem = ${f.origem}::origem_pedido` : sqlBruto('')
  const filtroData = f.data
    ? sql` and (p.criado_em at time zone ${TZ})::date = ${f.data}::date`
    : sqlBruto('')
  const cmp = sqlBruto(desc ? '<' : '>')
  const filtroCur = f.cursor
    ? sql` and (p.criado_em, p.id) ${cmp} (${f.cursor.ts}::timestamptz, ${f.cursor.id}::uuid)`
    : sqlBruto('')
  const ordem = sqlBruto(desc ? 'order by p.criado_em desc, p.id desc' : 'order by p.criado_em asc, p.id asc')
  return consultar<CardLinha>(
    exec,
    sql`select p.id, p.codigo, p.status, p.origem, p.modalidade, p.total_centavos,
               (select count(*)::int from public.itens_pedido ip
                 where ip.pedido_id = p.id and not ip.cancelado) as qtd_itens,
               c.nome as cliente_nome, p.problema_motivo, p.motoboy_nome, p.corrida_id,
               p.ordem_parada::int as ordem_parada, p.zona_id, ${TS('p.criado_em')} as criado_em,
               ${TS('p.criado_em')} as cursor_ts
          from public.pedidos p left join public.clientes c on c.id = p.cliente_id
         where p.loja_id = ${lojaId} and p.status = ${f.status}::status_pedido${filtroMod}${filtroOri}${filtroData}${filtroCur}
         ${ordem}
         limit ${f.limite + 1}`,
  )
}

export interface PedidoLinha {
  id: string
  codigo: string
  status: StatusPedido
  origem: OrigemPedido
  modalidade: ModalidadePedido
  subtotal_centavos: number
  taxa_entrega_centavos: number
  total_centavos: number
  forma_pagamento: FormaPagamento | null
  troco_para_centavos: number | null
  observacao: string | null
  problema_motivo: string | null
  entregue_em: string | null
  criado_em: string
  atualizado_em: string
  conversa_id: string | null
  zona_id: string | null
  corrida_id: string | null
  ordem_parada: number | null
  motoboy_id: string | null
  motoboy_nome: string | null
  cliente_id: string | null
  cliente_nome: string | null
  telefone_cifrado: Buffer | null
  endereco_id: string | null
}

export async function obterPedido(exec: Executor, lojaId: string, id: string) {
  return consultarUm<PedidoLinha>(
    exec,
    sql`select p.id, p.codigo, p.status, p.origem, p.modalidade, p.subtotal_centavos,
               p.taxa_entrega_centavos, p.total_centavos, p.forma_pagamento, p.troco_para_centavos,
               p.observacao, p.problema_motivo,
               ${TS('p.entregue_em')} as entregue_em, ${TS('p.criado_em')} as criado_em,
               ${TS('p.atualizado_em')} as atualizado_em, p.conversa_id, p.zona_id, p.corrida_id,
               p.ordem_parada::int as ordem_parada, p.motoboy_id, p.motoboy_nome,
               p.cliente_id, c.nome as cliente_nome, c.telefone_cifrado, p.endereco_id
          from public.pedidos p left join public.clientes c on c.id = p.cliente_id
         where p.id = ${id} and p.loja_id = ${lojaId}`,
  )
}

export interface EnderecoLinha {
  id: string
  logradouro: string
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
  referencia: string | null
}

export async function obterEndereco(exec: Executor, lojaId: string, id: string) {
  return consultarUm<EnderecoLinha>(
    exec,
    sql`select id, logradouro, numero, complemento, bairro, cidade, uf::text as uf, cep, referencia
          from public.enderecos where id = ${id} and loja_id = ${lojaId}`,
  )
}

export interface ItemLinha {
  id: string
  item_id: string | null
  nome_snapshot: string
  preco_unitario_centavos: number
  quantidade: number
  total_centavos: number
  observacao: string | null
  cancelado: boolean
}
export interface OpcaoLinha {
  id: string
  item_pedido_id: string
  opcao_id: string | null
  grupo_nome_snapshot: string
  nome_snapshot: string
  preco_centavos: number
}

export async function itensDoPedido(exec: Executor, lojaId: string, pedidoId: string) {
  const itens = await consultar<ItemLinha>(
    exec,
    sql`select id, item_id, nome_snapshot, preco_unitario_centavos, quantidade::int as quantidade,
               total_centavos, observacao, cancelado
          from public.itens_pedido where pedido_id = ${pedidoId} and loja_id = ${lojaId}
         order by criado_em, id`,
  )
  const opcoes = await consultar<OpcaoLinha>(
    exec,
    sql`select o.id, o.item_pedido_id, o.opcao_id, o.grupo_nome_snapshot, o.nome_snapshot, o.preco_centavos
          from public.itens_pedido_opcoes o
          join public.itens_pedido ip on ip.id = o.item_pedido_id
         where ip.pedido_id = ${pedidoId} and o.loja_id = ${lojaId}
         order by o.criado_em, o.id`,
  )
  return { itens, opcoes }
}
