// Vitrine publica de planos (landing): contrato Zod proprio (o front nao importa @whaviso/shared)
// e o hook de leitura. Rota ABERTA (publico: true), sem login: o backend expoe SO os campos de
// marketing dos planos ativos. Quem define e o console /plataforma; aqui so refletimos.
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import { PLANOS_FALLBACK } from './planos_fallback'

export const PlanoPublicoDTO = z.object({
  id: z.string(),
  nome: z.string(),
  valor_centavos: z.number().int(),
  inclui: z.array(z.string()),
  /** Taxa de intermediacao ja resolvida (centavos). O comparador usa como taxa do whaviso. */
  taxa_intermediacao_centavos: z.number().int(),
})
export type PlanoPublicoDTO = z.infer<typeof PlanoPublicoDTO>
export const PlanosPublicosLista = z.array(PlanoPublicoDTO)

/**
 * Catalogo publico para a landing. Cache generoso: o catalogo muda pouco.
 *
 * `initialData` faz a instantanea estatica (ultimo deploy) valer como o dado da consulta desde
 * o primeiro render: a tela nunca mostra "carregando" nem erro por causa do catalogo. Com
 * `initialDataUpdatedAt: 0` ela nasce "velha", entao o React Query busca o dado real em segundo
 * plano assim que monta e substitui silenciosamente quando chega. Se essa busca FALHAR (banco
 * fora do ar, sem rede), o React Query mantem o ultimo dado bom (aqui, o fallback) em vez de
 * limpar para um estado de erro, como aconteceria com `placeholderData`.
 */
export function usePlanosPublicos() {
  return useQuery({
    queryKey: ['landing', 'planos_publicos'],
    staleTime: 5 * 60_000,
    initialData: PLANOS_FALLBACK,
    initialDataUpdatedAt: 0,
    queryFn: ({ signal }) =>
      apiClient.get<PlanoPublicoDTO[]>('/plataforma-cobranca/planos-publicos', {
        schema: PlanosPublicosLista,
        signal,
        publico: true,
      }),
  })
}
