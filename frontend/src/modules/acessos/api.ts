// Camada de dados do modulo acessos (console do operador, so admin). Rotas de OPERADOR: nao
// enviam x-loja-id (`semLoja`). O servidor decide; a tela le e edita a mesma grade.
//   GET   /v1/acessos         catalogo + grade efetiva
//   PATCH /v1/acessos/grade   uma celula {escopo, papel, permissao, permitido}
// Este modulo NUNCA importa outro modulo. Raiz de cache ['acessos'].
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import { AcessosSaida, CelulaDTO } from './schemas'

export const RAIZ = 'acessos'

export function useAcessos() {
  return useQuery({
    queryKey: [RAIZ],
    staleTime: 0,
    queryFn: ({ signal }) => apiClient.get<AcessosSaida>('/acessos', { schema: AcessosSaida, signal, semLoja: true }),
  })
}

/** Salva as celulas alteradas, uma a uma (cada save audita e invalida o cache do servidor). */
export function useSalvarAcessos() {
  const qc = useQueryClient()
  return useMutation<number, Error, CelulaDTO[]>({
    mutationFn: async (celulas) => {
      let salvas = 0
      for (const c of celulas) {
        await apiClient.patch<CelulaDTO>('/acessos/grade', { body: c, schema: CelulaDTO, semLoja: true })
        salvas += 1
      }
      return salvas
    },
    onSettled: () => qc.invalidateQueries({ queryKey: [RAIZ] }),
  })
}
