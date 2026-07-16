// Camada de dados do módulo produtos (E17): CRUD do catálogo do usuário.
// Estado de servidor via TanStack Query; dados só pelo api_client. A raiz ['produtos'] é
// compartilhada por STRING com o hook de leitura do módulo avisos (autocomplete do pedido),
// que a invalida ao criar/editar (fronteira do lint, sem import cruzado).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/shared/api_client'
import {
  listaProdutosResposta,
  produtoSchema,
  type AtualizarProdutoBody,
  type CriarProdutoBody,
  type Produto,
} from '@/shared/contracts'

const KEY = ['produtos'] as const

/** GET /v1/produtos: meus produtos não arquivados (nome asc). Degrada 404 -> [] (backend antigo). */
export function useProdutos() {
  return useQuery({
    queryKey: KEY,
    queryFn: async ({ signal }) => {
      try {
        return await apiClient.get<Produto[]>('/produtos', { schema: listaProdutosResposta, signal })
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.code === 'rota_inexistente')) {
          return [] as Produto[]
        }
        throw e
      }
    },
  })
}

/** POST /v1/produtos: cria um produto. */
export function useCriarProduto() {
  const qc = useQueryClient()
  return useMutation<Produto, Error, CriarProdutoBody>({
    mutationFn: (body) => apiClient.post<Produto>('/produtos', { body, schema: produtoSchema }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY })
    },
  })
}

/**
 * PATCH /v1/produtos/:id: renomeia (propaga o rótulo dos itens no servidor), troca o preço
 * (não propaga) ou arquiva. Invalida ['produtos'] e ['avisos'] (renomear reescreve a descrição
 * dos itens de combinados existentes; a lista/detalhe precisa relê-los).
 */
export function useAtualizarProduto() {
  const qc = useQueryClient()
  return useMutation<Produto, Error, { id: string; body: AtualizarProdutoBody }>({
    mutationFn: ({ id, body }) =>
      apiClient.patch<Produto>(`/produtos/${id}`, { body, schema: produtoSchema }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY })
      void qc.invalidateQueries({ queryKey: ['avisos'] })
    },
  })
}
