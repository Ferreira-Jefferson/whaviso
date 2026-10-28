// Contratos de borda do modulo despacho (basico/manual): atribuir motoboy ao pedido e montar a
// corrida (1 motoboy, N pedidos, ordem de parada definida a mao). Fonte unica (o codegen reemite
// para o front). Schemas Zod estritos (SEC-081): `loja_id` nunca vem do corpo.
// Dinheiro em centavos. O valor do motoboy por parada vem da zona do pedido (zonas_entrega).
// A roteirizacao automatica (`sugerida = true`) e de outra onda: aqui `sugerida` e sempre false.
import { z } from 'zod'
import { statusCorrida, statusPedido, tipoVeiculo } from './enums'
import { Centavos, UuidSchema } from './primitivos'

const Uuid = UuidSchema
const DataHora = z.string().min(1)

/** Teto defensivo de pedidos por corrida (SEC-081): lote de moto, nao carga. */
export const CORRIDA_PEDIDOS_MAX = 50

const ListaPedidos = z.array(Uuid).min(1).max(CORRIDA_PEDIDOS_MAX)

// statusCorrida vem de ./enums (fonte unica); reusado aqui sem redefinir.

// ---------------------------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------------------------
export const AtribuirMotoboyEntrada = z.strictObject({ motoboy_id: Uuid })
export type AtribuirMotoboyEntrada = z.infer<typeof AtribuirMotoboyEntrada>

/** Corrida nasce em `montando`, opcionalmente ja com motoboy e lista de pedidos (ordem = parada). */
export const CorridaEntrada = z.strictObject({
  motoboy_id: Uuid.optional(),
  pedido_ids: ListaPedidos.optional(),
})
export type CorridaEntrada = z.infer<typeof CorridaEntrada>

export const AdicionarPedidosEntrada = z.strictObject({ pedido_ids: ListaPedidos })
export type AdicionarPedidosEntrada = z.infer<typeof AdicionarPedidosEntrada>

/** Lista COMPLETA dos pedidos da corrida na nova ordem de parada. */
export const ReordenarParadasEntrada = z.strictObject({ pedido_ids: ListaPedidos })
export type ReordenarParadasEntrada = z.infer<typeof ReordenarParadasEntrada>

// ---------------------------------------------------------------------------------------------
// Saidas
// ---------------------------------------------------------------------------------------------
export const PedidoDespachoSaida = z.strictObject({
  pedido_id: Uuid,
  motoboy_id: Uuid.nullable(),
  motoboy_nome: z.string().nullable(),
  corrida_id: Uuid.nullable(),
})
export type PedidoDespachoSaida = z.infer<typeof PedidoDespachoSaida>

/** Endereco resumido da parada; `lat/lng` podem ser nulos (sem geocodificacao nesta onda). */
export const EnderecoParada = z.strictObject({
  resumo: z.string().nullable(),
  bairro: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
})

export const ParadaSaida = z.strictObject({
  pedido_id: Uuid,
  codigo: z.string(),
  status: statusPedido,
  ordem_parada: z.number().int().nullable(),
  total_centavos: Centavos,
  zona_id: Uuid.nullable(),
  zona_nome: z.string().nullable(),
  valor_motoboy_centavos: Centavos,
  endereco: EnderecoParada,
})
export type ParadaSaida = z.infer<typeof ParadaSaida>

export const CorridaSaida = z.strictObject({
  id: Uuid,
  status: statusCorrida,
  /** Corrida desfeita em `montando`: encerrada sem nunca ter sido despachada. */
  cancelada: z.boolean(),
  sugerida: z.boolean(),
  motoboy_id: Uuid.nullable(),
  motoboy_nome: z.string().nullable(),
  despachada_em: DataHora.nullable(),
  concluida_em: DataHora.nullable(),
  criado_em: DataHora,
  valor_motoboy_total_centavos: Centavos,
  paradas: z.array(ParadaSaida),
})
export type CorridaSaida = z.infer<typeof CorridaSaida>

export const PedidoProntoSaida = z.strictObject({
  pedido_id: Uuid,
  codigo: z.string(),
  status: statusPedido,
  total_centavos: Centavos,
  zona_id: Uuid.nullable(),
  zona_nome: z.string().nullable(),
  valor_motoboy_centavos: Centavos,
  endereco: EnderecoParada,
  criado_em: DataHora,
})
export type PedidoProntoSaida = z.infer<typeof PedidoProntoSaida>

export const MotoboyCargaSaida = z.strictObject({
  id: Uuid,
  nome: z.string(),
  veiculo: tipoVeiculo,
  corridas_abertas: z.number().int(),
  pedidos_em_aberto: z.number().int(),
})
export type MotoboyCargaSaida = z.infer<typeof MotoboyCargaSaida>

export const DespachoPainelSaida = z.strictObject({
  pedidos_prontos: z.array(PedidoProntoSaida),
  corridas: z.array(CorridaSaida),
  motoboys: z.array(MotoboyCargaSaida),
})
export type DespachoPainelSaida = z.infer<typeof DespachoPainelSaida>

/** Listagem leve de motoboys para o seletor do despacho: so id, nome, veiculo e ativo (sem PII). */
export const MotoboySeletorSaida = z.strictObject({
  id: Uuid,
  nome: z.string(),
  veiculo: tipoVeiculo,
  ativo: z.boolean(),
})
export type MotoboySeletorSaida = z.infer<typeof MotoboySeletorSaida>

export const MotoboySeletorListaSaida = z.strictObject({ itens: z.array(MotoboySeletorSaida) })
export type MotoboySeletorListaSaida = z.infer<typeof MotoboySeletorListaSaida>
