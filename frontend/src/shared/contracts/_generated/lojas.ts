// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/lojas.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Contratos de borda do modulo lojas (fonte unica; o codegen reemite para o front).
// Todo jsonb do banco (cores, endereco, area_entrega) passa por estes schemas (SEC-081).
// Disponibilidade/horarios tem fonte unica nas tabelas normalizadas (regras-negocio/05): nao
// vive mais no perfil da loja (a coluna legada lojas.horarios foi removida na migration 0061).
import { z } from 'zod'
import { papelMembro } from './enums'
import { DataHoraIso } from './primitivos'

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor deve ser #RRGGBB')
export const Cores = z.strictObject({
  primaria: Hex.optional(),
  secundaria: Hex.optional(),
  fundo: Hex.optional(),
  texto: Hex.optional(),
  destaque: Hex.optional(),
})
export type Cores = z.infer<typeof Cores>

export const Endereco = z.strictObject({
  logradouro: z.string().trim().min(1).max(200),
  numero: z.string().trim().min(1).max(20),
  complemento: z.string().trim().max(100).optional(),
  bairro: z.string().trim().min(1).max(100),
  cidade: z.string().trim().min(1).max(100),
  uf: z.string().regex(/^[A-Z]{2}$/),
  cep: z.string().regex(/^\d{8}$/),
})
export type Endereco = z.infer<typeof Endereco>

const Centro = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})
export const RAIO_KM_MAX = 50
export const AreaEntrega = z.discriminatedUnion('modo', [
  z.strictObject({
    modo: z.literal('raio'),
    raio_km: z.number().positive().max(RAIO_KM_MAX),
    centro: Centro,
  }),
  z.strictObject({
    modo: z.literal('bairros'),
    bairros: z
      .array(z.string().trim().min(1).max(100))
      .max(300)
      .refine((l) => new Set(l.map((b) => b.toLowerCase())).size === l.length, {
        message: 'bairros repetidos',
      }),
  }),
])
export type AreaEntrega = z.infer<typeof AreaEntrega>

const NomeLoja = z.string().trim().min(2).max(100)
// Esquema https e tamanho aqui; host allowlisted e checado no service.
export const LogoUrl = z.url({ protocol: /^https$/ }).max(500)

export const LojaCriarEntrada = z.strictObject({
  nome: NomeLoja,
  endereco: Endereco.optional(),
  area_entrega: AreaEntrega.optional(),
})
export type LojaCriarEntrada = z.infer<typeof LojaCriarEntrada>

export const LojaAtualizarEntrada = z
  .strictObject({
    nome: NomeLoja.optional(),
    endereco: Endereco.nullable().optional(),
    area_entrega: AreaEntrega.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'nenhum campo informado' })
export type LojaAtualizarEntrada = z.infer<typeof LojaAtualizarEntrada>

export const LojaBrandingEntrada = z
  .strictObject({ cores: Cores.optional(), logo_url: LogoUrl.nullable().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'nenhum campo informado' })
export type LojaBrandingEntrada = z.infer<typeof LojaBrandingEntrada>

/** Resumo de numeros WhatsApp da loja (so contagem; nunca token, hash ou telefone). */
export const NumerosResumo = z.strictObject({
  total: z.number().int().nonnegative(),
  conectados: z.number().int().nonnegative(),
})

/** Forma unica de saida, na lista e no detalhe. Sem conta_id (interno). */
export const LojaSaida = z.strictObject({
  id: z.uuid(),
  nome: z.string(),
  logo_url: z.string().nullable(),
  cores: Cores,
  endereco: Endereco.nullable(),
  area_entrega: AreaEntrega.nullable(),
  ativo: z.boolean(),
  // G7: pausa operacional (nao confundir com `ativo` nem com `suspensa` da cobranca) e capacidade.
  pausada: z.boolean(),
  pausada_motivo: z.string().nullable(),
  pausada_ate: DataHoraIso.nullable(),
  capacidade_por_janela: z.number().int().nullable(),
  capacidade_janela_minutos: z.number().int(),
  papel: papelMembro, // papel do usuario nesta loja (dono, ao ver loja inativa da propria conta)
  // Aceita pedido ao vivo agora? Derivado de horarios_funcionamento + excecoes_disponibilidade no
  // servidor (kernel disponibilidade); null quando a loja nao tem faixa de horario cadastrada.
  aberta_agora: z.boolean().nullable(),
  numeros_whatsapp: NumerosResumo,
  criado_em: DataHoraIso,
  atualizado_em: DataHoraIso,
})
export type LojaSaida = z.infer<typeof LojaSaida>

/** Pausar a loja agora: motivo opcional e prazo opcional (pausa que expira sozinha). */
export const LojaPausarEntrada = z.strictObject({
  motivo: z.string().trim().min(1).max(200).nullable().optional(),
  ate: DataHoraIso.nullable().optional(),
})
export type LojaPausarEntrada = z.infer<typeof LojaPausarEntrada>

/** Capacidade por janela: teto de pedidos (null = sem limite) numa faixa movel de M minutos. */
export const LojaCapacidadeEntrada = z.strictObject({
  por_janela: z.number().int().positive().nullable(),
  janela_minutos: z.number().int().min(1).max(1440).optional(),
})
export type LojaCapacidadeEntrada = z.infer<typeof LojaCapacidadeEntrada>

export const LojaListaSaida = z.strictObject({ itens: z.array(LojaSaida) })
export const LojaListaQuery = z.strictObject({
  incluir_inativas: z.enum(['true', 'false']).default('false'),
})
