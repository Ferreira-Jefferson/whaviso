// Chaves Pix do usuário (kernel `shared`): consumidas por `conta` (gerenciar) e
// por `avisos` (oferecer como opção no NovoAviso), sem que os módulos se importem.
// Estado de servidor 100% via TanStack Query; dados só pelo api_client.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../api_client'
import {
  chavePixSchema,
  listaChavesPixResposta,
  type AtualizarChavePixBody,
  type ChavePix,
  type CriarChavePixBody,
} from '../contracts'

export const chavesPixKeys = {
  todas: ['chaves-pix'] as const,
}

/** GET /v1/perfil/chaves-pix: chaves ativas do usuário (padrão primeiro). */
export function useChavesPix(habilitado = true) {
  return useQuery({
    queryKey: chavesPixKeys.todas,
    enabled: habilitado,
    queryFn: ({ signal }) =>
      apiClient.get<ChavePix[]>('/perfil/chaves-pix', {
        schema: listaChavesPixResposta,
        signal,
      }),
  })
}

/** POST /v1/perfil/chaves-pix: cria uma chave (409 `chave_pix_duplicada` se já existe). */
export function useCriarChavePix() {
  const qc = useQueryClient()
  return useMutation<ChavePix, Error, CriarChavePixBody>({
    mutationFn: (body) =>
      apiClient.post<ChavePix>('/perfil/chaves-pix', { body, schema: chavePixSchema }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chavesPixKeys.todas })
    },
  })
}

/** PATCH /v1/perfil/chaves-pix/:id: editar rótulo, tornar padrão ou arquivar (soft-delete). */
export function useAtualizarChavePix() {
  const qc = useQueryClient()
  return useMutation<ChavePix, Error, { id: string; body: AtualizarChavePixBody }>({
    mutationFn: ({ id, body }) =>
      apiClient.patch<ChavePix>(`/perfil/chaves-pix/${id}`, { body, schema: chavePixSchema }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chavesPixKeys.todas })
    },
  })
}

export type { ChavePix }
