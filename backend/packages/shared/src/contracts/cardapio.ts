// Contratos de borda do cardapio (fonte unica; o codegen reemite para o front).
// Schemas Zod estritos (SEC-081): z.strictObject, tamanhos e enums fechados.
// Dinheiro em centavos (primitivo Centavos). Nenhum schema aceita loja_id: a loja vem do escopo.
import { z } from 'zod'
import { Centavos, DataHoraIso, UuidSchema } from './primitivos'
import { tipoGrupo } from './enums'

// Reusa o enum do kernel (`tamanho|adicional|customizado`); alias local para montar os
// schemas. O tipo publico `TipoGrupo` ja vem de ./enums (nao reexportamos para nao colidir).
const TipoGrupo = tipoGrupo

const nome = z.string().trim().min(1).max(80)
const descricao = z.string().trim().max(500)
const ordemInt = z.number().int().min(0).max(1_000_000)

// ---------------------------------------------------------------- programacao
// Janelas semanais em America/Sao_Paulo. dias: 0=domingo..6=sabado. fim e exclusivo; fim < inicio
// cruza a meia-noite (a janela pertence ao dia de inicio e continua ate o fim no dia seguinte).
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use HH:MM')
export const Janela = z
  .strictObject({
    dias: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    inicio: hhmm,
    fim: hhmm,
  })
  .refine((j) => j.inicio !== j.fim, { message: 'inicio e fim nao podem ser iguais', path: ['fim'] })
  .refine((j) => new Set(j.dias).size === j.dias.length, { message: 'dias repetidos', path: ['dias'] })
export type Janela = z.infer<typeof Janela>

export const Programacao = z.strictObject({ janelas: z.array(Janela).min(1).max(14) })
export type Programacao = z.infer<typeof Programacao>

// ---------------------------------------------------------------- reordenacao
export const ReordenarEntrada = z.strictObject({
  ids: z.array(UuidSchema).min(1).max(500),
})

// ---------------------------------------------------------------- opcoes
export const OpcaoCriar = z.strictObject({
  nome,
  preco_centavos: Centavos.default(0),
  padrao: z.boolean().default(false),
  ordem: ordemInt.optional(),
})
export type OpcaoCriar = z.infer<typeof OpcaoCriar>
export const OpcaoAtualizar = z
  .strictObject({
    nome: nome.optional(),
    preco_centavos: Centavos.optional(),
    padrao: z.boolean().optional(),
    ativo: z.boolean().optional(),
    ordem: ordemInt.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'nenhum campo informado' })
export type OpcaoAtualizar = z.infer<typeof OpcaoAtualizar>

export const OpcaoSaida = z.strictObject({
  id: UuidSchema,
  grupo_id: UuidSchema,
  nome: z.string(),
  preco_centavos: Centavos,
  padrao: z.boolean(),
  ativo: z.boolean(),
  esgotado_ate: DataHoraIso.nullable(),
  ordem: z.number().int(),
  disponivel: z.boolean(),
})
export type OpcaoSaida = z.infer<typeof OpcaoSaida>

// ---------------------------------------------------------------- grupos
export const GrupoCriar = z.strictObject({
  nome,
  tipo: TipoGrupo.default('customizado'),
  obrigatorio: z.boolean().default(false),
  min_escolhas: z.number().int().min(0).max(99).optional(),
  max_escolhas: z.number().int().min(1).max(99).nullable().default(null),
  aplica_a_opcao_id: UuidSchema.nullable().default(null),
  ordem: ordemInt.optional(),
  opcoes: z.array(OpcaoCriar).max(60).default([]),
})
export type GrupoCriar = z.infer<typeof GrupoCriar>
export const GrupoAtualizar = z
  .strictObject({
    nome: nome.optional(),
    tipo: TipoGrupo.optional(),
    obrigatorio: z.boolean().optional(),
    min_escolhas: z.number().int().min(0).max(99).optional(),
    max_escolhas: z.number().int().min(1).max(99).nullable().optional(),
    aplica_a_opcao_id: UuidSchema.nullable().optional(),
    ativo: z.boolean().optional(),
    ordem: ordemInt.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'nenhum campo informado' })
export type GrupoAtualizar = z.infer<typeof GrupoAtualizar>

export const Impacto = z.strictObject({ grupo_id: UuidSchema, nome: z.string() })
export type Impacto = z.infer<typeof Impacto>
export const GrupoSaida = z.strictObject({
  id: UuidSchema,
  nome: z.string(),
  tipo: TipoGrupo,
  obrigatorio: z.boolean(),
  min_escolhas: z.number().int(),
  max_escolhas: z.number().int().nullable(),
  aplica_a_opcao_id: UuidSchema.nullable(),
  ativo: z.boolean(),
  ordem: z.number().int(),
  opcoes: z.array(OpcaoSaida),
})
export type GrupoSaida = z.infer<typeof GrupoSaida>
/** Mutacoes de grupo/opcao avisam o que ficou pendurado (add-ons de tamanho desativado). */
export const GrupoMutacaoSaida = GrupoSaida.extend({ impactos: z.array(Impacto) })
export const OpcaoMutacaoSaida = OpcaoSaida.extend({ impactos: z.array(Impacto) })
export const GruposSaida = z.strictObject({ grupos: z.array(GrupoSaida) })

// ---------------------------------------------------------------- categorias
export const CategoriaCriar = z.strictObject({
  nome,
  descricao: descricao.nullable().default(null),
  programacao: Programacao.nullable().default(null),
  ordem: ordemInt.optional(),
})
export const CategoriaAtualizar = z
  .strictObject({
    nome: nome.optional(),
    descricao: descricao.nullable().optional(),
    programacao: Programacao.nullable().optional(),
    ativo: z.boolean().optional(),
    ordem: ordemInt.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'nenhum campo informado' })

export const VinculoCategoria = z.strictObject({ grupo_id: UuidSchema, ordem: ordemInt.default(0) })
export const CategoriaGruposEntrada = z.strictObject({ grupos: z.array(VinculoCategoria).max(60) })

export const CategoriaSaida = z.strictObject({
  id: UuidSchema,
  nome: z.string(),
  descricao: z.string().nullable(),
  programacao: Programacao.nullable(),
  ativo: z.boolean(),
  ordem: z.number().int(),
  grupos: z.array(z.strictObject({ grupo_id: UuidSchema, ordem: z.number().int() })),
})
export type CategoriaSaida = z.infer<typeof CategoriaSaida>

// ---------------------------------------------------------------- itens
export const ImagemUrl = z.string().trim().max(2048).url()
export const ItemCriar = z.strictObject({
  categoria_id: UuidSchema,
  nome,
  descricao: descricao.nullable().default(null),
  preco_centavos: Centavos.default(0),
  imagem_url: ImagemUrl.nullable().default(null),
  sugerivel: z.boolean().default(false),
  ordem: ordemInt.optional(),
})
export const ItemAtualizar = z
  .strictObject({
    categoria_id: UuidSchema.optional(),
    nome: nome.optional(),
    descricao: descricao.nullable().optional(),
    preco_centavos: Centavos.optional(),
    imagem_url: ImagemUrl.nullable().optional(),
    sugerivel: z.boolean().optional(),
    ativo: z.boolean().optional(),
    ordem: ordemInt.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'nenhum campo informado' })

// Excecao por item: incluir=true acrescenta grupo que a categoria nao tem; false remove herdado.
export const ExcecaoItem = z.strictObject({
  grupo_id: UuidSchema,
  incluir: z.boolean(),
  ordem: ordemInt.default(0),
})
export type ExcecaoItem = z.infer<typeof ExcecaoItem>
export const ItemGruposEntrada = z.strictObject({ excecoes: z.array(ExcecaoItem).max(60) })

export const ItemSaida = z.strictObject({
  id: UuidSchema,
  categoria_id: UuidSchema,
  nome: z.string(),
  descricao: z.string().nullable(),
  preco_centavos: Centavos,
  imagem_url: z.string().nullable(),
  sugerivel: z.boolean(),
  ativo: z.boolean(),
  esgotado_ate: DataHoraIso.nullable(),
  ordem: z.number().int(),
  disponivel: z.boolean(),
  excecoes: z.array(z.strictObject({ grupo_id: UuidSchema, incluir: z.boolean(), ordem: z.number().int() })),
})
export type ItemSaida = z.infer<typeof ItemSaida>
export const ItemMutacaoSaida = ItemSaida.extend({ excecoes_resetadas: z.boolean() })

// ---------------------------------------------------------------- disponibilidade
export const DisponibilidadeEntrada = z
  .strictObject({
    ativo: z.boolean().optional(),
    /** Instante (futuro) ate quando fica indisponivel; null limpa. */
    esgotado_ate: DataHoraIso.nullable().optional(),
    /** Atalho "esgotado hoje": fim do dia em America/Sao_Paulo. false limpa. */
    esgotado_hoje: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'nenhum campo informado' })
  .refine((o) => !(o.esgotado_hoje !== undefined && o.esgotado_ate !== undefined), {
    message: 'use esgotado_hoje OU esgotado_ate',
    path: ['esgotado_ate'],
  })
export type DisponibilidadeEntrada = z.infer<typeof DisponibilidadeEntrada>
export const DisponibilidadeSaida = z.strictObject({
  id: UuidSchema,
  ativo: z.boolean(),
  esgotado_ate: DataHoraIso.nullable(),
  disponivel: z.boolean(),
  impactos: z.array(Impacto),
})

// ---------------------------------------------------------------- arvore resolvida
export const GrupoResolvido = z.strictObject({
  id: UuidSchema,
  nome: z.string(),
  tipo: TipoGrupo,
  obrigatorio: z.boolean(),
  min_escolhas: z.number().int(),
  max_escolhas: z.number().int().nullable(),
  aplica_a_opcao_id: UuidSchema.nullable(),
  ordem: z.number().int(),
  /** De onde veio o grupo efetivo: herdado da categoria ou acrescentado por excecao do item. */
  origem: z.enum(['categoria', 'item']),
  opcoes: z.array(OpcaoSaida),
})
export type GrupoResolvido = z.infer<typeof GrupoResolvido>
export const ItemResolvido = ItemSaida.extend({
  /** Pedivel agora: item disponivel, categoria ativa e dentro da programacao. */
  pedivel: z.boolean(),
  grupos: z.array(GrupoResolvido),
})
export type ItemResolvido = z.infer<typeof ItemResolvido>
export const CategoriaResolvida = CategoriaSaida.extend({
  disponivel_agora: z.boolean(),
  itens: z.array(ItemResolvido),
})
export type CategoriaResolvida = z.infer<typeof CategoriaResolvida>
export const CardapioResolvidoSaida = z.strictObject({
  gerado_em: DataHoraIso,
  categorias: z.array(CategoriaResolvida),
})
export type CardapioResolvidoSaida = z.infer<typeof CardapioResolvidoSaida>
