// Contratos de borda do modulo campanhas (fonte unica; o codegen reemite para o front).
// Campanha de WhatsApp da loja sobre o consumidor final: nasce rascunho, dispara via template
// aprovado pela Meta (caminho sancionado fora da janela de 24h) e enfileira na outbox `envios`.
// Schemas Zod estritos (SEC-081). Nenhum DTO devolve telefone nem hash: o cliente aparece por id.
// Dinheiro em centavos; datas em ISO UTC.
import { z } from 'zod'
import { UuidSchema } from './primitivos'

const DataHora = z.string().min(1)

/** Estado da campanha: rascunho -> enfileirada (toda a outbox criada) | cancelada. */
export const campanhaStatus = ['rascunho', 'enfileirada', 'cancelada'] as const
export const CampanhaStatus = z.enum(campanhaStatus)
export type CampanhaStatus = z.infer<typeof CampanhaStatus>

// Segmentos RFM (espelha `crmSegmentos` da view clientes_metricas; mantido inline para o codegen
// copiar o arquivo so com imports de ./primitivos e ./enums). Se o CRM mudar, atualizar aqui tambem.
export const campanhaSegmentos = [
  'campeao', 'fiel', 'em_risco', 'novo', 'ocasional', 'perdido', 'sem_pedido',
] as const
export const CampanhaSegmento = z.enum(campanhaSegmentos)
export type CampanhaSegmento = z.infer<typeof CampanhaSegmento>

/** Filtro do publico-alvo. O opt-out e SEMPRE excluido (nao e opcao); so refina por segmento. */
export const CampanhaFiltro = z.strictObject({
  segmento: CampanhaSegmento.optional(),
})
export type CampanhaFiltro = z.infer<typeof CampanhaFiltro>

/** Variaveis fixas do template, por nome declarado (mesmas para todos os destinatarios). */
export const CampanhaVariaveis = z.record(z.string().min(1), z.string().max(1024))

// ---------------------------------------------------------------- entrada

export const CampanhaEntrada = z.strictObject({
  nome: z.string().trim().min(1).max(120),
  template_chave: z.string().trim().min(1).max(120),
  numero_whatsapp_id: UuidSchema,
  filtro: CampanhaFiltro.default({}),
  variaveis: CampanhaVariaveis.default({}),
})
export type CampanhaNova = z.infer<typeof CampanhaEntrada>

// ---------------------------------------------------------------- saida

/** Contagem de entrega agregada (lida de `envios` por join; null = ainda sem recibo). */
export const CampanhaEntregaResumo = z.strictObject({
  enfileirados: z.number().int().nonnegative(),
  enviados: z.number().int().nonnegative(),
  entregues: z.number().int().nonnegative(),
  lidos: z.number().int().nonnegative(),
  falhas: z.number().int().nonnegative(),
  cancelados: z.number().int().nonnegative(),
})
export type CampanhaEntregaResumo = z.infer<typeof CampanhaEntregaResumo>

export const CampanhaItem = z.strictObject({
  id: UuidSchema,
  nome: z.string(),
  template_chave: z.string(),
  numero_whatsapp_id: UuidSchema,
  filtro: CampanhaFiltro,
  status: CampanhaStatus,
  total_destinatarios: z.number().int().nonnegative(),
  enfileirado_em: DataHora.nullable(),
  criado_em: DataHora,
})
export type CampanhaItem = z.infer<typeof CampanhaItem>

export const CampanhaDetalheSaida = CampanhaItem.extend({
  variaveis: z.record(z.string(), z.string()),
  entrega: CampanhaEntregaResumo,
})
export type CampanhaDetalheSaida = z.infer<typeof CampanhaDetalheSaida>

export const CampanhasSaida = z.strictObject({
  itens: z.array(CampanhaItem),
})

/** Estimativa do publico-alvo ANTES de disparar (quantos recebem, excluido opt-out). */
export const CampanhaDestinatariosSaida = z.strictObject({
  total: z.number().int().nonnegative(),
  segmento: CampanhaSegmento.nullable(),
})

/** Resultado do disparo: quantos foram efetivamente enfileirados na outbox. */
export const CampanhaDisparoSaida = z.strictObject({
  id: UuidSchema,
  status: CampanhaStatus,
  total_destinatarios: z.number().int().nonnegative(),
  enfileirados: z.number().int().nonnegative(),
})
export type CampanhaDisparoSaida = z.infer<typeof CampanhaDisparoSaida>

export const CampanhaCancelarSaida = z.strictObject({
  id: UuidSchema,
  status: CampanhaStatus,
  cancelados: z.number().int().nonnegative(),
})
