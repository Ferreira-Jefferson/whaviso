// Tipos do motor deterministico do pedido (AT-motor-min). SEM LLM: o grafo decide por
// botao/regra. O node ENTENDE e PROPOE (SaidaNode: proximo + mensagens + efeitos); o MOTOR
// efetiva (ver HARNESS-ATENDENTE.md, fronteira sagrada). Aqui ficam so os contratos de dados
// do turno; a logica mora nos nodes e no service.
import { z } from 'zod'

/** Uma linha do carrinho em construcao (referencias opacas; o preco e calculado no servidor). */
export const LinhaCarrinho = z
  .object({
    item_id: z.string().uuid(),
    quantidade: z.number().int().min(1).max(50),
    opcoes_ids: z.array(z.string().uuid()).max(30),
  })
  .strict()
export type LinhaCarrinho = z.infer<typeof LinhaCarrinho>

/**
 * Estado do fluxo, persistido em `conversas.contexto` (jsonb). O motor e o unico que escreve.
 * `etapa` e o node atual; os demais campos sao o rascunho e o scratch da etapa. `apresentados`
 * guarda os ids que ESTE motor ofereceu no ultimo menu: a resposta numerica mapeia por posicao
 * e o id e revalidado contra a loja (o id vindo do cliente e entrada nao confiavel, SEC-002).
 */
export const EstadoFluxo = z
  .object({
    etapa: z.string().min(1),
    carrinho: z.array(LinhaCarrinho).max(50).default([]),
    apresentados: z.array(z.string()).max(50).default([]),
    categoria_id: z.string().uuid().nullable().default(null),
    item_id: z.string().uuid().nullable().default(null),
    /** fila de grupos a perguntar do item em construcao ([0] = grupo atual). */
    grupos_pendentes: z.array(z.string().uuid()).max(30).default([]),
    /** opcoes ja escolhidas no grupo ATUAL (acumula ate o minimo/maximo). */
    opcoes_grupo: z.array(z.string().uuid()).max(30).default([]),
    /** todas as opcoes ja fechadas do item em construcao. */
    opcoes_ids: z.array(z.string().uuid()).max(30).default([]),
    endereco_id: z.string().uuid().nullable().default(null),
    /** sub-passo de texto livre aguardado no cadastro de endereco novo. */
    aguardando: z.enum(['endereco_bairro', 'endereco_rua']).nullable().default(null),
    /** bairro ja escolhido do endereco novo em construcao (resolve a zona/taxa). */
    bairro_rascunho: z.string().max(120).nullable().default(null),
    pagamento: z.enum(['pix', 'dinheiro', 'cartao']).nullable().default(null),
    pedido_id: z.string().uuid().nullable().default(null),
    codigo: z.string().nullable().default(null),
    falhas: z.number().int().min(0).default(0),
    /**
     * Versao do fluxo FIXADA nesta conversa (uuid de uma versao publicada ou `padrao`). null = ainda
     * nao fixada: o motor fixa no primeiro turno. Fixar garante que a conversa termina na versao em
     * que comecou, mesmo que a loja publique outra no meio (contrato de API-fluxo).
     */
    fluxo_versao_id: z.string().min(1).nullable().default(null),
  })
  .strict()
export type EstadoFluxo = z.infer<typeof EstadoFluxo>

export const ETAPA_INICIAL = 'saudacao'

export function estadoInicial(): EstadoFluxo {
  return EstadoFluxo.parse({ etapa: ETAPA_INICIAL })
}

/** Evento do turno ja normalizado (texto livre ou id de botao/lista opaco). */
export interface EventoTurno {
  readonly tipo: 'texto' | 'botao' | 'outro'
  /** texto livre do cliente, trim; null fora de texto. */
  readonly texto: string | null
  /** id opaco do botao/lista escolhido; null fora de interativo. */
  readonly botaoId: string | null
}

/** Loja no contexto do turno (so o que o motor usa). */
export interface LojaCtx {
  readonly id: string
  readonly nome: string
  readonly horarios: unknown
  /** Pausa operacional em vigor agora (G7, migration 0053): nao aceita pedido novo enquanto durar. */
  readonly pausada_agora: boolean
}

/** Cliente no contexto do turno. */
export interface ClienteCtx {
  readonly id: string
  readonly nome: string | null
  readonly telefone_hash: string
}

/** Grupo de opcoes efetivo de um item. */
export interface GrupoCtx {
  readonly id: string
  readonly nome: string
  readonly obrigatorio: boolean
  readonly min_escolhas: number
  readonly max_escolhas: number | null
  readonly aplica_a_opcao_id: string | null
  readonly ordem: number
  readonly opcoes: readonly OpcaoCtx[]
}
export interface OpcaoCtx {
  readonly id: string
  readonly grupo_id: string
  readonly nome: string
  readonly preco_centavos: number
}
export interface ItemCtx {
  readonly id: string
  readonly categoria_id: string
  readonly nome: string
  readonly preco_centavos: number
}
export interface CategoriaCtx {
  readonly id: string
  readonly nome: string
}

/** Snapshot do cardapio vivo da loja, lido a cada turno (nunca cache). */
export interface CardapioCtx {
  readonly categorias: readonly CategoriaCtx[]
  /** itens disponiveis por categoria_id. */
  readonly itensPorCategoria: ReadonlyMap<string, readonly ItemCtx[]>
  /** itens disponiveis por id (revalidacao de escolha e resumo do carrinho). */
  readonly itensPorId: ReadonlyMap<string, ItemCtx>
  /** grupos efetivos por item_id (ja resolvida a heranca categoria -> item). */
  readonly gruposPorItem: ReadonlyMap<string, readonly GrupoCtx[]>
}

/** Entrada selada que o motor injeta no node (TEntrada do NodeContract). */
export interface EntradaTurno {
  readonly evento: EventoTurno
  readonly estado: EstadoFluxo
  readonly loja: LojaCtx
  readonly cliente: ClienteCtx
  readonly cardapio: CardapioCtx
  /** endereco anterior do cliente (base do "repetir ultimo"); null se nao ha. */
  readonly ultimoEnderecoId: string | null
  /** bairro do ultimo endereco (checagem de area ao repetir); null se nao ha/sem bairro. */
  readonly ultimoEnderecoBairro: string | null
  /** bairros das zonas de entrega ATIVAS da loja (area atendida). Vazio = sem restricao de area. */
  readonly zonasBairros: readonly string[]
  /** status VIVO do pedido corrente da conversa (estado.pedido_id); null se nao ha pedido. */
  readonly pedidoStatus: string | null
  readonly agora: Date
}

/** Config vazia padrao dos nodes deterministicos (sem parametro). */
export const ConfigVazia = z.object({}).strict()
export type ConfigVazia = z.infer<typeof ConfigVazia>
