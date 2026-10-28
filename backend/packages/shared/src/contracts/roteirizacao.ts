// Contratos de borda da roteirizacao de despacho (sugestao automatica de corridas). Fonte unica (o
// codegen reemite para o front). Schemas Zod estritos (SEC-081): `loja_id` nunca vem do corpo.
// A sugestao NAO persiste corrida: so `aceitar` grava (e devolve a CorridaSaida do despacho).
// Duracoes em minutos inteiros, distancias em metros; datas/horas em ISO UTC (o painel converte
// para America/Sao_Paulo). Nenhum campo de contato/telefone trafega aqui.
import { z } from 'zod'
import { CorridaSaida } from './despacho'
import { UuidSchema } from './primitivos'

const Uuid = UuidSchema
const DataHora = z.string().min(1)

/** Teto defensivo de ids por chamada (SEC-080/081). */
export const ROTEIRIZACAO_PEDIDOS_MAX = 50

// ---------------------------------------------------------------------------------------------
// Configuracao por loja
// ---------------------------------------------------------------------------------------------
export const DespachoConfigSaida = z.strictObject({
  preparo_base_min: z.number().int().min(0).max(120),
  preparo_por_item_min: z.number().min(0).max(60),
  max_pedidos_corrida: z.number().int().min(1).max(10),
  janela_saida_min: z.number().int().min(0).max(120),
  desvio_max_min: z.number().int().min(0).max(120),
  origem_lat: z.number().min(-90).max(90).nullable(),
  origem_lng: z.number().min(-180).max(180).nullable(),
  volta_a_loja: z.boolean(),
  /** Usada so no fallback em linha reta (provedor de mapas fora do ar). */
  velocidade_media_kmh: z.number().int().min(5).max(120),
})
export type DespachoConfigSaida = z.infer<typeof DespachoConfigSaida>

/** Patch parcial; origem so vale com lat e lng juntos (ou ambos null para limpar). */
export const DespachoConfigEntrada = z
  .strictObject({
    preparo_base_min: z.number().int().min(0).max(120),
    preparo_por_item_min: z.number().min(0).max(60),
    max_pedidos_corrida: z.number().int().min(1).max(10),
    janela_saida_min: z.number().int().min(0).max(120),
    desvio_max_min: z.number().int().min(0).max(120),
    origem_lat: z.number().min(-90).max(90).nullable(),
    origem_lng: z.number().min(-180).max(180).nullable(),
    volta_a_loja: z.boolean(),
    velocidade_media_kmh: z.number().int().min(5).max(120),
  })
  .partial()
  .refine((v) => (v.origem_lat === undefined) === (v.origem_lng === undefined), {
    message: 'Informe origem_lat e origem_lng juntos',
  })
  .refine((v) => (v.origem_lat === null) === (v.origem_lng === null), {
    message: 'origem_lat e origem_lng devem ser ambos nulos ou ambos preenchidos',
  })
export type DespachoConfigEntrada = z.infer<typeof DespachoConfigEntrada>

// ---------------------------------------------------------------------------------------------
// Geocodificacao
// ---------------------------------------------------------------------------------------------
export const GeocodificarPendentesEntrada = z.strictObject({
  limite: z.number().int().min(1).max(25).default(10),
})
export type GeocodificarPendentesEntrada = z.infer<typeof GeocodificarPendentesEntrada>

export const GeocodificarPendentesSaida = z.strictObject({
  processados: z.number().int(),
  geocodificados: z.number().int(),
  falhas: z.number().int(),
  /** Parou antes do fim por limite/indisponibilidade do provedor (tente de novo depois). */
  interrompido: z.boolean(),
  restantes: z.number().int(),
})
export type GeocodificarPendentesSaida = z.infer<typeof GeocodificarPendentesSaida>

// ---------------------------------------------------------------------------------------------
// Geocodificar um endereco avulso (seletor de mapa do painel: planta o icone da loja).
// Nao persiste nada: so devolve a coordenada para o front. Campos coerentes com `consultaEndereco`.
// ---------------------------------------------------------------------------------------------
export const GeocodificarEnderecoEntrada = z.strictObject({
  logradouro: z.string().trim().min(1).max(200),
  numero: z.string().trim().max(20).optional(),
  bairro: z.string().trim().max(100).optional(),
  cidade: z.string().trim().max(100).optional(),
  uf: z.string().trim().max(2).optional(),
  cep: z.string().trim().max(9).optional(),
})
export type GeocodificarEnderecoEntrada = z.infer<typeof GeocodificarEnderecoEntrada>

export const GeocodificarEnderecoSaida = z.discriminatedUnion('encontrado', [
  z.strictObject({
    encontrado: z.literal(true),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  z.strictObject({ encontrado: z.literal(false) }),
])
export type GeocodificarEnderecoSaida = z.infer<typeof GeocodificarEnderecoSaida>

// ---------------------------------------------------------------------------------------------
// Sugestao
// ---------------------------------------------------------------------------------------------
export const RoteirizacaoSugerirEntrada = z.strictObject({
  pedido_ids: z.array(Uuid).min(1).max(ROTEIRIZACAO_PEDIDOS_MAX).optional(),
  /** Quantos motoboys estao disponiveis; corridas alem desse numero saem com `sem_motoboy`. */
  motoboys_disponiveis: z.number().int().min(0).max(50).optional(),
  /** Geocodifica sob demanda os enderecos sem coordenada (padrao: sim, em lote pequeno). */
  geocodificar: z.boolean().default(true),
})
export type RoteirizacaoSugerirEntrada = z.infer<typeof RoteirizacaoSugerirEntrada>

export const ParadaSugerida = z.strictObject({
  pedido_id: Uuid,
  codigo: z.string(),
  ordem_parada: z.number().int().min(1),
  bairro: z.string().nullable(),
  endereco_resumo: z.string().nullable(),
  pronto_previsto_em: DataHora,
  /** Minutos de viagem desde a saida da loja ate esta parada. */
  chegada_min: z.number().int().min(0),
})
export type ParadaSugerida = z.infer<typeof ParadaSugerida>

export const CorridaSugerida = z.strictObject({
  /** 1 = a que deve sair primeiro (pronto previsto mais cedo). */
  ordem_saida: z.number().int().min(1),
  /** Saida sugerida: o ultimo pedido do grupo a ficar pronto. */
  saida_prevista_em: DataHora,
  paradas: z.array(ParadaSugerida).min(1),
  tempo_total_min: z.number().int().min(0),
  distancia_total_m: z.number().int().min(0),
  /** true: tempos por linha reta (provedor de mapas indisponivel), nao por rota real. */
  estimado: z.boolean(),
  sem_motoboy: z.boolean(),
})
export type CorridaSugerida = z.infer<typeof CorridaSugerida>

export const motivoSemLocalizacao = z.enum(['sem_endereco', 'geocode_falhou', 'fora_da_area', 'pendente'])
export type MotivoSemLocalizacao = z.infer<typeof motivoSemLocalizacao>

export const SemLocalizacao = z.strictObject({
  pedido_id: Uuid,
  codigo: z.string(),
  motivo: motivoSemLocalizacao,
})
export type SemLocalizacao = z.infer<typeof SemLocalizacao>

export const RoteirizacaoSugerirSaida = z.strictObject({
  gerado_em: DataHora,
  /** Algum tempo veio por estimativa em linha reta. */
  estimado: z.boolean(),
  /** Origem configurada na loja; false = usada a media das paradas (sem origem cadastrada). */
  origem_configurada: z.boolean(),
  corridas: z.array(CorridaSugerida),
  sem_localizacao: z.array(SemLocalizacao),
})
export type RoteirizacaoSugerirSaida = z.infer<typeof RoteirizacaoSugerirSaida>

// ---------------------------------------------------------------------------------------------
// Aceitar e reordenar
// ---------------------------------------------------------------------------------------------
/** Uma corrida por chamada: `pedido_ids` ja na ordem de parada sugerida. */
export const RoteirizacaoAceitarEntrada = z.strictObject({
  pedido_ids: z.array(Uuid).min(1).max(10),
  motoboy_id: Uuid.optional(),
})
export type RoteirizacaoAceitarEntrada = z.infer<typeof RoteirizacaoAceitarEntrada>

/** Aceitar devolve a corrida criada (`sugerida = true`), no formato do despacho. */
export const RoteirizacaoAceitarSaida = CorridaSaida
export type RoteirizacaoAceitarSaida = z.infer<typeof RoteirizacaoAceitarSaida>

export const RoteirizacaoReordenarEntrada = z.strictObject({
  pedido_ids: z.array(Uuid).min(2).max(10),
})
export type RoteirizacaoReordenarEntrada = z.infer<typeof RoteirizacaoReordenarEntrada>

/** Nova ordem calculada; nao persiste (quem persiste e PUT /despacho/corridas/:id/ordem). */
export const RoteirizacaoReordenarSaida = z.strictObject({
  pedido_ids: z.array(Uuid),
  tempo_total_min: z.number().int().min(0),
  distancia_total_m: z.number().int().min(0),
  estimado: z.boolean(),
})
export type RoteirizacaoReordenarSaida = z.infer<typeof RoteirizacaoReordenarSaida>
