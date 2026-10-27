// Contratos de borda do modulo canais (integracao de pedidos de canais externos: iFood e outros).
// Fonte unica; o codegen reemite para o front. Schemas estritos (SEC-081).
//
// SEGREDO: a credencial do canal e WRITE-ONLY na borda. So a ENTRADA carrega `credencial`; nenhuma
// saida a devolve (o estado so mostra metadado e os ultimos 4 caracteres). A loja efetiva vem do
// ESCOPO (x-loja-id), nunca do corpo. Dinheiro em centavos.
import { z } from 'zod'
import { Centavos, DataHoraIso } from './primitivos'

export const canalTipo = z.enum(['ifood', 'outro'])
export type CanalTipo = z.infer<typeof canalTipo>

/** Credencial/token do canal (write-only): so barra lixo obvio; o formato e do provedor. */
export const CredencialCanal = z
  .string()
  .trim()
  .min(16, 'credencial curta demais')
  .max(4096, 'credencial longa demais')
  .refine((s) => !/\s/.test(s), { message: 'credencial nao pode conter espaco' })

/** Configuracao NAO secreta do canal (ex.: id do restaurante no provedor). */
export const CanalConfig = z.strictObject({
  merchant_id: z.string().trim().min(1).max(64).optional(),
  rotulo: z.string().trim().min(1).max(60).optional(),
})
export type CanalConfig = z.infer<typeof CanalConfig>

// ---- Pedido externo (formato canonico que todo ClienteCanal devolve) -------------------------

export const ItemPedidoExterno = z.strictObject({
  nome: z.string().trim().min(1).max(200),
  quantidade: z.number().int().min(1).max(99),
  preco_unitario_centavos: Centavos,
  observacao: z.string().trim().max(300).optional(),
})
export type ItemPedidoExterno = z.infer<typeof ItemPedidoExterno>

/**
 * Pedido de um canal externo ja traduzido para o modelo interno. Sem PII do consumidor (nome,
 * telefone, endereco): o canal e dono desse dado e a loja o ve no proprio canal.
 */
export const PedidoExterno = z.strictObject({
  id_externo: z.string().trim().min(1).max(128),
  criado_em: DataHoraIso,
  modalidade: z.enum(['entrega', 'retirada']),
  itens: z.array(ItemPedidoExterno).min(1).max(100),
  subtotal_centavos: Centavos,
  taxa_entrega_centavos: Centavos,
  total_centavos: Centavos,
  observacao: z.string().trim().max(500).optional(),
})
export type PedidoExterno = z.infer<typeof PedidoExterno>

// ---- Entradas --------------------------------------------------------------------------------

/** PUT /canais: conecta (ou troca a credencial de) um canal da loja. */
export const CanalConectarEntrada = z.strictObject({
  canal: canalTipo,
  credencial: CredencialCanal, // nunca devolvida, nunca logada, nunca persistida em claro
  config: CanalConfig.optional(),
})
export type CanalConectarEntrada = z.infer<typeof CanalConectarEntrada>

/** PATCH /canais/:canal: ativa/desativa e/ou ajusta a config, sem reenviar a credencial. */
export const CanalPatch = z
  .strictObject({ ativo: z.boolean().optional(), config: CanalConfig.optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'nenhum campo informado' })
export type CanalPatch = z.infer<typeof CanalPatch>

// ---- Saidas ----------------------------------------------------------------------------------

export const CanalEstado = z.strictObject({
  canal: canalTipo,
  ativo: z.boolean(),
  ultimos4: z.string().nullable(),
  config: CanalConfig,
  ultima_sincronizacao_em: DataHoraIso.nullable(),
  /** Codigo curto do ultimo erro de sincronizacao (nunca texto cru do provedor). */
  ultimo_erro: z.string().nullable(),
  criado_em: DataHoraIso,
  atualizado_em: DataHoraIso,
})
export type CanalEstado = z.infer<typeof CanalEstado>

export const CanaisSaida = z.strictObject({ canais: z.array(CanalEstado) })

export const CanalSincronizarSaida = z.strictObject({
  importados: z.number().int().nonnegative(),
  duplicados: z.number().int().nonnegative(),
  rejeitados: z.number().int().nonnegative(),
})
export type CanalSincronizarSaida = z.infer<typeof CanalSincronizarSaida>

export const CanalPedidoItem = z.strictObject({
  id_externo: z.string(),
  pedido_id: z.uuid(),
  codigo: z.string(),
  total_centavos: Centavos,
  criado_em: DataHoraIso,
})
export const CanalPedidosSaida = z.strictObject({ pedidos: z.array(CanalPedidoItem) })
