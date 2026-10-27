import { z } from 'zod'
import type { ErroProvedor, Resultado } from './erros'

// Fronteira ClienteMapas (usada pela api). Provedor-padrao gratuito (Nominatim + OSRM/ORS),
// Google opcional. Distancias em metros, duracoes em segundos.

export const Ponto = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict()
export type Ponto = z.infer<typeof Ponto>

export const PrecisaoGeo = z.enum(['exata', 'rua', 'bairro', 'cidade', 'aproximada'])
export type PrecisaoGeo = z.infer<typeof PrecisaoGeo>

export const GeocodificarEntrada = z.object({ endereco: z.string().min(3).max(500) }).strict()
export const Geocodificado = Ponto.extend({ precisao: PrecisaoGeo }).strict()
export type Geocodificado = z.infer<typeof Geocodificado>

export const MatrizEntrada = z
  .object({ origens: z.array(Ponto).min(1).max(100), destinos: z.array(Ponto).min(1).max(100) })
  .strict()
export type MatrizEntrada = z.infer<typeof MatrizEntrada>

export interface MatrizResposta {
  /** [origem][destino], metros. */
  distanciasM: number[][]
  /** [origem][destino], segundos. */
  duracoesS: number[][]
}

export const RotaEntrada = z.object({ paradas: z.array(Ponto).min(2).max(50) }).strict()
export type RotaEntrada = z.infer<typeof RotaEntrada>

export interface RotaResposta {
  /** Ordem de visita (indices em `paradas`); a primeira parada e sempre a origem. */
  ordem: number[]
  distanciaM: number
  duracaoS: number
}

type R<T> = Promise<Resultado<T, ErroProvedor>>

export interface ClienteMapas {
  geocodificar(endereco: string): R<Geocodificado>
  matriz(origens: Ponto[], destinos: Ponto[]): R<MatrizResposta>
  rota(paradas: Ponto[]): R<RotaResposta>
}
