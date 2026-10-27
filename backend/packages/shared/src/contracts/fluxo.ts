// Contratos de borda do modulo fluxo (builder visual do grafo de atendimento).
// Fonte unica: o codegen reemite para o front. O grafo e dado serializavel: cada node aponta para um
// `tipo` do CATALOGO FECHADO abaixo (sem HTTP arbitrario, codigo ou expressao avaliavel). O descritor
// segue o NodeContract do kernel (tipo, configSchema, usaLlm), sem o `executar`: a execucao e do motor
// do atendente; aqui so ha a forma estatica que o editor edita e a api valida.
import { z } from 'zod'
import { UuidSchema } from './primitivos'
import type { NodeContract } from './node'

const DataHora = z.string().min(1)

// ---------------------------------------------------------------- limites (anti abuso)

/** Limites de regra (o validador reporta `limite_excedido`). */
export const FLUXO_LIMITES = { nodes: 100, arestas: 300, bytes: 262_144, profundidadeConfig: 4 } as const
/** Teto duro da forma (barra payload gigante antes de validar a regra). */
const TETO_NODES = 200
const TETO_ARESTAS = 600

// Ids de node/aresta em formato restrito (SEC-081): sem espacos nem simbolos.
const IdGrafo = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'id invalido (a-z, 0-9, _; ate 40)')

// ---------------------------------------------------------------- catalogo de nodes (fechado)

const Texto = z.string().trim().min(1).max(500)

const configSaudacao = z.strictObject({ mensagem: Texto.optional() })
const configPedirCategoria = z.strictObject({
  mensagem: Texto.optional(),
  max_tentativas: z.number().int().min(1).max(5).default(3),
})
const configMontarPedido = z.strictObject({
  permitir_observacao: z.boolean().default(true),
  max_itens: z.number().int().min(1).max(50).default(50),
})
const configConfirmar = z.strictObject({ mensagem: Texto.optional() })
const configEndereco = z.strictObject({ mensagem: Texto.optional() })
const configPagamento = z.strictObject({
  metodos: z.array(z.enum(['pix', 'dinheiro', 'cartao'])).min(1).max(3).default(['pix', 'dinheiro', 'cartao']),
})
const configAcompanhar = z.strictObject({ mensagem: Texto.optional() })

export interface HandleDescritor {
  id: string
  rotulo: string
  /** Handle sem aresta = fim do turno (o motor devolve `proximo: null`). */
  encerra: boolean
}

/** Descritor de node: o NodeContract sem `executar` + metadados do editor e do validador. */
export interface NodeDescritor extends Pick<NodeContract, 'tipo' | 'configSchema' | 'usaLlm'> {
  rotulo: string
  /** Handles de saida. O handle de entrada e unico e implicito. */
  handles: readonly HandleDescritor[]
  /** Node que efetiva algo sem volta (cria pedido, cobra): so alcancavel passando por `confirmar`. */
  irreversivel: boolean
  /** Node terminal (sem saida alem de si): conta como saida do fluxo. */
  terminal: boolean
  /** Node que o grafo precisa conter. */
  obrigatorio: boolean
}

const h = (id: string, rotulo: string, encerra = false): HandleDescritor => ({ id, rotulo, encerra })
const base = { usaLlm: false, irreversivel: false, terminal: false, obrigatorio: false } as const

// Espelha o grafo fixo do motor (saudacao ... acompanhar); `encerra` = o `null` de `proximos`.
export const CATALOGO_NODES: readonly NodeDescritor[] = [
  { ...base, tipo: 'saudacao', rotulo: 'Saudacao', configSchema: configSaudacao,
    handles: [h('proximo', 'Seguir'), h('encerrar', 'Encerrar', true)] },
  { ...base, tipo: 'pedir_categoria', rotulo: 'Escolher categoria', configSchema: configPedirCategoria,
    handles: [h('proximo', 'Seguir'), h('repetir', 'Repetir'), h('encerrar', 'Encerrar', true)] },
  { ...base, tipo: 'montar_pedido', rotulo: 'Montar pedido', configSchema: configMontarPedido,
    handles: [h('proximo', 'Fechar pedido'), h('mais', 'Adicionar mais'), h('encerrar', 'Encerrar', true)] },
  { ...base, tipo: 'confirmar', rotulo: 'Confirmar pedido', configSchema: configConfirmar, obrigatorio: true,
    handles: [h('proximo', 'Confirmado'), h('voltar', 'Alterar pedido'), h('encerrar', 'Encerrar', true)] },
  { ...base, tipo: 'endereco', rotulo: 'Endereco de entrega', configSchema: configEndereco,
    handles: [h('proximo', 'Seguir'), h('repetir', 'Repetir'), h('encerrar', 'Encerrar', true)] },
  { ...base, tipo: 'pagamento', rotulo: 'Pagamento', configSchema: configPagamento, irreversivel: true,
    handles: [h('proximo', 'Seguir'), h('repetir', 'Repetir'), h('encerrar', 'Encerrar', true)] },
  { ...base, tipo: 'acompanhar', rotulo: 'Acompanhar pedido', configSchema: configAcompanhar, terminal: true,
    handles: [] },
]

// ---------------------------------------------------------------- grafo

export const FluxoNode = z.strictObject({
  id: IdGrafo,
  tipo: z.string().min(1).max(40),
  // Forma livre aqui (objeto); o schema do tipo e aplicado pelo validador (codigo config_invalida).
  config: z.record(z.string().max(60), z.unknown()).default({}),
  posicao: z.strictObject({ x: z.number().min(-100000).max(100000), y: z.number().min(-100000).max(100000) }),
})
export type FluxoNode = z.infer<typeof FluxoNode>

export const FluxoAresta = z.strictObject({
  id: IdGrafo,
  de: IdGrafo,
  handle: z.string().min(1).max(40),
  para: IdGrafo,
})
export type FluxoAresta = z.infer<typeof FluxoAresta>

export const FluxoGrafo = z.strictObject({
  inicial: IdGrafo,
  nodes: z.array(FluxoNode).max(TETO_NODES),
  edges: z.array(FluxoAresta).max(TETO_ARESTAS),
})
export type FluxoGrafo = z.infer<typeof FluxoGrafo>

// ---------------------------------------------------------------- validacao

export const fluxoErroCodigos = [
  'limite_excedido', 'id_duplicado', 'no_desconhecido', 'config_invalida', 'aresta_invalida',
  'sem_inicio', 'no_inalcancavel', 'sem_saida', 'ciclo_sem_saida',
  'no_obrigatorio_ausente', 'acao_irreversivel_sem_confirmacao',
] as const
export const FluxoErroCodigo = z.enum(fluxoErroCodigos)
export type FluxoErroCodigo = z.infer<typeof FluxoErroCodigo>

export const FluxoProblema = z.strictObject({
  codigo: FluxoErroCodigo,
  mensagem: z.string(),
  node_id: z.string().nullable(),
  edge_id: z.string().nullable(),
})
export type FluxoProblema = z.infer<typeof FluxoProblema>

export const FluxoValidacaoSaida = z.strictObject({
  valido: z.boolean(),
  erros: z.array(FluxoProblema),
  avisos: z.array(FluxoProblema),
})
export type FluxoValidacao = z.infer<typeof FluxoValidacaoSaida>

// ---------------------------------------------------------------- entrada

export const FluxoCriarEntrada = z.strictObject({
  nome: z.string().trim().min(1).max(120),
  /** Sem grafo, o rascunho nasce do fluxo padrao. */
  grafo: FluxoGrafo.optional(),
})
export type FluxoNovo = z.infer<typeof FluxoCriarEntrada>

export const FluxoRascunhoEntrada = z.strictObject({
  grafo: FluxoGrafo,
  /** Controle otimista: `atualizado_em` do rascunho que o editor carregou (divergiu = 409). */
  atualizado_em_base: DataHora.optional(),
})
export type FluxoRascunhoEntrada = z.infer<typeof FluxoRascunhoEntrada>

export const FluxoRenomearEntrada = z.strictObject({ nome: z.string().trim().min(1).max(120) })

// ---------------------------------------------------------------- saida

export const fluxoVersaoStatus = ['rascunho', 'publicada', 'arquivada'] as const
export const FluxoVersaoStatus = z.enum(fluxoVersaoStatus)
export type FluxoVersaoStatus = z.infer<typeof FluxoVersaoStatus>

export const FluxoVersaoResumo = z.strictObject({
  id: UuidSchema,
  versao: z.number().int().positive(),
  status: FluxoVersaoStatus,
  publicada_em: DataHora.nullable(),
  criado_em: DataHora,
  atualizado_em: DataHora,
})
export type FluxoVersaoResumo = z.infer<typeof FluxoVersaoResumo>

export const FluxoVersaoSaida = FluxoVersaoResumo.extend({ grafo: FluxoGrafo })
export type FluxoVersaoDto = z.infer<typeof FluxoVersaoSaida>

export const FluxoSaida = z.strictObject({
  id: UuidSchema,
  nome: z.string(),
  ativo: z.boolean(),
  criado_em: DataHora,
  atualizado_em: DataHora,
  /** Versao publicada vigente (null = ainda nada publicado). */
  publicada: FluxoVersaoSaida.nullable(),
  rascunho: FluxoVersaoSaida.nullable(),
})
export type FluxoDto = z.infer<typeof FluxoSaida>

export const FluxosSaida = z.strictObject({
  itens: z.array(
    z.strictObject({
      id: UuidSchema,
      nome: z.string(),
      ativo: z.boolean(),
      criado_em: DataHora,
      versao_publicada: z.number().int().nullable(),
      tem_rascunho: z.boolean(),
    }),
  ),
})
export type FluxosDto = z.infer<typeof FluxosSaida>

export const FluxoVersoesSaida = z.strictObject({ itens: z.array(FluxoVersaoResumo) })

export const FluxoCatalogoItem = z.strictObject({
  tipo: z.string(),
  rotulo: z.string(),
  usa_llm: z.boolean(),
  irreversivel: z.boolean(),
  terminal: z.boolean(),
  obrigatorio: z.boolean(),
  handles: z.array(z.strictObject({ id: z.string(), rotulo: z.string(), encerra: z.boolean() })),
  /** JSON Schema da config, gerado do Zod do node. */
  config_schema: z.record(z.string(), z.unknown()),
})
export const FluxoCatalogoSaida = z.strictObject({ nodes: z.array(FluxoCatalogoItem) })
export type FluxoCatalogoDto = z.infer<typeof FluxoCatalogoSaida>

// ---------------------------------------------------------------- fluxo padrao (dado serializavel)

/** Fluxo padrao: o mesmo do motor (saudacao -> ... -> acompanhar), como dado. */
export const FLUXO_PADRAO: FluxoGrafo = {
  inicial: 'saudacao',
  nodes: [
    { id: 'saudacao', tipo: 'saudacao', config: {}, posicao: { x: 0, y: 0 } },
    { id: 'pedir_categoria', tipo: 'pedir_categoria', config: {}, posicao: { x: 220, y: 0 } },
    { id: 'montar_pedido', tipo: 'montar_pedido', config: {}, posicao: { x: 440, y: 0 } },
    { id: 'confirmar', tipo: 'confirmar', config: {}, posicao: { x: 660, y: 0 } },
    { id: 'endereco', tipo: 'endereco', config: {}, posicao: { x: 880, y: 0 } },
    { id: 'pagamento', tipo: 'pagamento', config: {}, posicao: { x: 1100, y: 0 } },
    { id: 'acompanhar', tipo: 'acompanhar', config: {}, posicao: { x: 1320, y: 0 } },
  ],
  edges: [
    { id: 'e_saudacao', de: 'saudacao', handle: 'proximo', para: 'pedir_categoria' },
    { id: 'e_categoria', de: 'pedir_categoria', handle: 'proximo', para: 'montar_pedido' },
    { id: 'e_categoria_repetir', de: 'pedir_categoria', handle: 'repetir', para: 'pedir_categoria' },
    { id: 'e_montar', de: 'montar_pedido', handle: 'proximo', para: 'confirmar' },
    { id: 'e_montar_mais', de: 'montar_pedido', handle: 'mais', para: 'montar_pedido' },
    { id: 'e_confirmar', de: 'confirmar', handle: 'proximo', para: 'endereco' },
    { id: 'e_confirmar_voltar', de: 'confirmar', handle: 'voltar', para: 'pedir_categoria' },
    { id: 'e_endereco', de: 'endereco', handle: 'proximo', para: 'pagamento' },
    { id: 'e_endereco_repetir', de: 'endereco', handle: 'repetir', para: 'endereco' },
    { id: 'e_pagamento', de: 'pagamento', handle: 'proximo', para: 'acompanhar' },
    { id: 'e_pagamento_repetir', de: 'pagamento', handle: 'repetir', para: 'pagamento' },
  ],
}
