// Vitrine publica de planos (landing): contrato Zod proprio (o front nao importa @whaviso/shared)
// e o hook de leitura. Rota ABERTA (publico: true), sem login: o backend expoe SO os campos de
// marketing dos planos ativos. Quem define e o console /plataforma; aqui so refletimos.
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { apiClient } from '@/shared/api_client'

export const PlanoPublicoDTO = z.object({
  id: z.string(),
  nome: z.string(),
  valor_centavos: z.number().int(),
  inclui: z.array(z.string()),
})
export type PlanoPublicoDTO = z.infer<typeof PlanoPublicoDTO>
export const PlanosPublicosLista = z.array(PlanoPublicoDTO)

/** Catalogo publico para a landing. Cache generoso: o catalogo muda pouco. */
export function usePlanosPublicos() {
  return useQuery({
    queryKey: ['landing', 'planos_publicos'],
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      apiClient.get<PlanoPublicoDTO[]>('/plataforma-cobranca/planos-publicos', {
        schema: PlanosPublicosLista,
        signal,
        publico: true,
      }),
  })
}
