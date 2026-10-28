// Geocodificacao para o seletor de area: transforma endereco em ponto no mapa, sem o usuario digitar
// coordenada. O provedor de geocode pode estar fora do ar em dev (sem API_MAPAS_*): tudo aqui degrada
// para null em vez de quebrar a tela.
import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import { useLojaAtiva } from '@/shared/tenant'
import { LojaListaSaida } from '@/shared/contracts/_generated/lojas'
import type { PontoMapa } from './tipos'

// Contrato oficial vem de _generated/roteirizacao.ts quando o backend publicar
// POST /roteirizacao/geocodificar-endereco; ate la, schema local minimo (fallback) para nao travar.
const GeocodificarEnderecoSaida = z.union([
  z.object({ encontrado: z.literal(true), lat: z.number(), lng: z.number() }),
  z.object({ encontrado: z.literal(false) }),
])
type GeocodificarEnderecoSaida = z.infer<typeof GeocodificarEnderecoSaida>

/** Campos de endereco aceitos pela geocodificacao (apenas logradouro e obrigatorio). */
export interface EnderecoParaGeocode {
  logradouro: string
  numero?: string
  bairro?: string
  cidade?: string
  uf?: string
  cep?: string
}

/** Chama o backend; devolve o ponto ou null (endereco nao encontrado ou provedor indisponivel). */
async function chamarGeocode(
  endereco: EnderecoParaGeocode,
  signal?: AbortSignal,
): Promise<PontoMapa | null> {
  try {
    const r = await apiClient.post<GeocodificarEnderecoSaida>('/roteirizacao/geocodificar-endereco', {
      schema: GeocodificarEnderecoSaida,
      signal,
      body: {
        logradouro: endereco.logradouro,
        numero: endereco.numero,
        bairro: endereco.bairro,
        cidade: endereco.cidade,
        uf: endereco.uf,
        cep: endereco.cep,
      },
    })
    return r.encontrado ? { lat: r.lat, lng: r.lng } : null
  } catch {
    // Provedor indisponivel / erro de rede: degrada para null (o usuario posiciona no mapa a mao).
    return null
  }
}

/** Expoe `geocodificar(endereco)` para o chamador buscar um ponto sob demanda. */
export function useGeocodificarEndereco(): {
  geocodificar: (endereco: EnderecoParaGeocode) => Promise<PontoMapa | null>
} {
  const geocodificar = useCallback((endereco: EnderecoParaGeocode) => chamarGeocode(endereco), [])
  return { geocodificar }
}

/**
 * Ponto da loja ativa para centrar o mapa e desenhar o icone da lojinha. Busca o endereco da loja
 * ativa (GET /lojas), geocodifica e devolve o ponto. Devolve null (sem quebrar) quando a loja nao
 * tem endereco, o geocode esta indisponivel ou ainda nao ha loja ativa.
 */
export function useCentroLoja(): { data: PontoMapa | null; isPending: boolean } {
  const lojaAtiva = useLojaAtiva()
  const lojaId = lojaAtiva?.id ?? null

  const consulta = useQuery({
    queryKey: ['centro-loja', lojaId],
    enabled: lojaId != null,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }): Promise<PontoMapa | null> => {
      const lista = await apiClient.get('/lojas', { schema: LojaListaSaida, semLoja: true, signal })
      const loja = (lista as { itens: Array<{ id: string; endereco: EnderecoParaGeocode | null }> }).itens.find(
        (l) => l.id === lojaId,
      )
      const endereco = loja?.endereco
      if (!endereco) return null
      return chamarGeocode(endereco, signal)
    },
  })

  return {
    data: consulta.data ?? null,
    isPending: lojaId != null && consulta.isPending,
  }
}
