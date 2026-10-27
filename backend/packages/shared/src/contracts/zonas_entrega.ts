// Contratos de borda do modulo zonas_entrega (fonte unica; o codegen reemite para o front).
// Schemas Zod estritos (SEC-081). Zona de entrega precifica a entrega: taxa cobrada do cliente e
// valor pago ao motoboy (centavos), mais pedido minimo e frete gratis. Tres tipos de zona:
//   bairro   -> `bairro` (texto);
//   poligono -> `area` GeoJSON Polygon ([lng, lat], anel fechado);
//   raio     -> `centro {lat,lng}` + `metros`; no banco vira area = { centro, metros }.
import { z } from 'zod'
import { Centavos, UuidSchema } from './primitivos'

const Uuid = UuidSchema
const DataHora = z.string().min(1)
const texto = (max: number) => z.string().trim().min(1).max(max)

/** Limites defensivos (SEC-081): poligono gigante e raio absurdo sao DoS/abuso, nao cadastro. */
export const ZONA_POLIGONO_PONTOS_MAX = 200
export const ZONA_RAIO_METROS_MAX = 100_000
export const ZONA_LOTE_BAIRROS_MAX = 200

const Lat = z.number().min(-90).max(90)
const Lng = z.number().min(-180).max(180)
export const ZonaPonto = z.strictObject({ lat: Lat, lng: Lng })

/** Posicao GeoJSON: [longitude, latitude]. */
const Posicao = z.tuple([Lng, Lat])

export const ZonaAreaPoligono = z.strictObject({
  type: z.literal('Polygon'),
  // Um unico anel (sem buracos): >= 4 pontos (3 distintos + fechamento), primeiro = ultimo.
  coordinates: z
    .array(z.array(Posicao).min(4).max(ZONA_POLIGONO_PONTOS_MAX))
    .length(1)
    .refine(
      (aneis) => {
        const a = aneis[0]!
        const p = a[0]!
        const u = a[a.length - 1]!
        return p[0] === u[0] && p[1] === u[1]
      },
      { message: 'poligono deve ser fechado (primeiro ponto igual ao ultimo)' },
    ),
})

export const ZonaAreaRaio = z.strictObject({
  centro: ZonaPonto,
  metros: z.number().int().min(1).max(ZONA_RAIO_METROS_MAX),
})

// Campos comuns de valor. Minimo e frete gratis: null = sem regra.
const valores = {
  taxa_cliente_centavos: Centavos,
  valor_motoboy_centavos: Centavos,
  pedido_minimo_centavos: Centavos.nullable().optional(),
  frete_gratis_acima_centavos: Centavos.nullable().optional(),
}

export const ZonaEntrada = z.discriminatedUnion('tipo', [
  z.strictObject({ tipo: z.literal('bairro'), nome: texto(80), bairro: texto(80), ...valores }),
  z.strictObject({ tipo: z.literal('poligono'), nome: texto(80), area: ZonaAreaPoligono, ...valores }),
  z.strictObject({
    tipo: z.literal('raio'),
    nome: texto(80),
    centro: ZonaPonto,
    metros: ZonaAreaRaio.shape.metros,
    ...valores,
  }),
])

/** PATCH parcial. `tipo` nao muda; `bairro`/`area` so valem para o tipo correspondente (422 se nao). */
export const ZonaAtualizarEntrada = z
  .strictObject({
    nome: texto(80).optional(),
    bairro: texto(80).optional(),
    area: z.union([ZonaAreaPoligono, ZonaAreaRaio]).optional(),
    taxa_cliente_centavos: Centavos.optional(),
    valor_motoboy_centavos: Centavos.optional(),
    pedido_minimo_centavos: Centavos.nullable().optional(),
    frete_gratis_acima_centavos: Centavos.nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'informe ao menos um campo' })

/** Importacao rapida: varios bairros com os mesmos valores. Transacional (tudo ou nada). */
export const ZonaLoteEntrada = z.strictObject({
  bairros: z.array(texto(80)).min(1).max(ZONA_LOTE_BAIRROS_MAX),
  taxa_cliente_centavos: Centavos,
  valor_motoboy_centavos: Centavos,
  pedido_minimo_centavos: Centavos.nullable().optional(),
  frete_gratis_acima_centavos: Centavos.nullable().optional(),
})

export const ZonaSaida = z.strictObject({
  id: Uuid,
  nome: z.string(),
  tipo: z.enum(['bairro', 'poligono', 'raio']),
  bairro: z.string().nullable(),
  area: z.union([ZonaAreaPoligono, ZonaAreaRaio]).nullable(),
  taxa_cliente_centavos: z.number().int(),
  valor_motoboy_centavos: z.number().int(),
  pedido_minimo_centavos: z.number().int().nullable(),
  frete_gratis_acima_centavos: z.number().int().nullable(),
  ativo: z.boolean(),
  // Aviso de impacto: pedidos em andamento (novo, em preparo, saiu p/ entrega) nesta zona.
  // Informativo; nao bloqueia (pedido antigo guarda o valor no momento da criacao).
  pedidos_em_aberto: z.number().int().nonnegative(),
  criado_em: DataHora,
  atualizado_em: DataHora,
})
export const ZonaListaSaida = z.strictObject({ itens: z.array(ZonaSaida) })

export const ZonaListaQuery = z.strictObject({ incluir_inativas: z.enum(['true', 'false']).optional() })

/** Resolver: por bairro e/ou coordenadas (lat e lng juntos). */
export const ResolverZonaEntrada = z
  .strictObject({
    bairro: texto(80).optional(),
    lat: Lat.optional(),
    lng: Lng.optional(),
  })
  .refine((o) => (o.lat === undefined) === (o.lng === undefined), {
    message: 'informe lat e lng juntos',
  })
  .refine((o) => o.bairro !== undefined || o.lat !== undefined, {
    message: 'informe bairro ou lat/lng',
  })

export const ResolverZonaSaida = z.union([
  z.strictObject({
    fora_da_area: z.literal(false),
    zona_id: Uuid,
    nome: z.string(),
    taxa_cliente_centavos: z.number().int(),
    valor_motoboy_centavos: z.number().int(),
    pedido_minimo_centavos: z.number().int().nullable(),
    frete_gratis_acima_centavos: z.number().int().nullable(),
  }),
  z.strictObject({ fora_da_area: z.literal(true) }),
])

export type ZonaNova = z.infer<typeof ZonaEntrada>
export type ZonaPatch = z.infer<typeof ZonaAtualizarEntrada>
export type ZonaLote = z.infer<typeof ZonaLoteEntrada>
export type ZonaDto = z.infer<typeof ZonaSaida>
export type ResolverZonaDto = z.infer<typeof ResolverZonaSaida>
export type ZonaAreaPoligonoDto = z.infer<typeof ZonaAreaPoligono>
export type ZonaAreaRaioDto = z.infer<typeof ZonaAreaRaio>
