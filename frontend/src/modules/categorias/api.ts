// Camada de dados do módulo categorias (E16): CRUD das categorias do usuário.
// Estado de servidor via TanStack Query; dados só pelo api_client. A raiz ['categorias']
// é compartilhada por STRING com os hooks de leitura dos módulos avisos/painel (que a
// invalidam ao criar): manter a raiz em sincronia (fronteira do lint, sem import cruzado).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  categoriaSchema,
  listaCategoriasResposta,
  type AtualizarCategoriaBody,
  type Categoria,
  type CriarCategoriaBody,
} from '@/shared/contracts'

const KEY = ['categorias'] as const

/** GET /v1/categorias: minhas categorias não arquivadas (nome asc). */
export function useCategorias() {
  return useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) =>
      apiClient.get<Categoria[]>('/categorias', { schema: listaCategoriasResposta, signal }),
  })
}

/** POST /v1/categorias: cria uma categoria. */
export function useCriarCategoria() {
  const qc = useQueryClient()
  return useMutation<Categoria, Error, CriarCategoriaBody>({
    mutationFn: (body) => apiClient.post<Categoria>('/categorias', { body, schema: categoriaSchema }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY })
    },
  })
}

/** PATCH /v1/categorias/:id: renomeia, troca a cor ou arquiva (soft-delete). */
export function useAtualizarCategoria() {
  const qc = useQueryClient()
  return useMutation<Categoria, Error, { id: string; body: AtualizarCategoriaBody }>({
    mutationFn: ({ id, body }) =>
      apiClient.patch<Categoria>(`/categorias/${id}`, { body, schema: categoriaSchema }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY })
      // Arquivar/renomear muda o que o painel e o form mostram: revalida a lista de avisos.
      void qc.invalidateQueries({ queryKey: ['avisos'] })
    },
  })
}
