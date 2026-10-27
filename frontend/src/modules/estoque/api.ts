// Camada de dados do estoque. Duas sub-arvores de cache sob a raiz ['estoque']:
//   ['estoque','insumos', incluirInativos] -> lista de insumos (materia-prima)
//   ['estoque','ficha', itemId]            -> ficha tecnica de um item do cardapio
// Toda mutacao de insumo/movimento invalida ['estoque'] (lista + baixo estoque recarregam
// juntos). Dados so pelo apiClient; a loja ativa vai no header x-loja-id (nunca no corpo).
// Contratos: @/shared/contracts/_generated/{estoque_insumos,ficha_tecnica}.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import {
  InsumoAtualizarEntrada,
  InsumoCriarEntrada,
  InsumoListaSaida,
  InsumoSaida,
  MovimentoInsumoAplicadoSaida,
  MovimentoInsumoEntrada,
  MovimentoInsumoListaSaida,
  type InsumoDto,
  type MovimentoInsumoDto,
} from '@/shared/contracts/_generated/estoque_insumos'
import {
  FichaTecnicaEntrada,
  FichaTecnicaSaida,
  type FichaTecnicaSaida as FichaTecnica,
} from '@/shared/contracts/_generated/ficha_tecnica'

export const RAIZ = 'estoque'

// Corpos das mutacoes: inferidos da ENTRADA dos schemas (defaults viram opcionais).
type CriarInsumoBody = z.input<typeof InsumoCriarEntrada>
type AtualizarInsumoBody = z.input<typeof InsumoAtualizarEntrada>
type MovimentoBody = z.input<typeof MovimentoInsumoEntrada>
type FichaBody = z.input<typeof FichaTecnicaEntrada>

type InsumoAplicado = z.infer<typeof MovimentoInsumoAplicadoSaida>

function useInvalidarRaiz() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: [RAIZ] })
}

// ------------------------------------------------------------------ insumos
/** GET /v1/estoque-insumos: lista de insumos da loja (com flag abaixo_minimo). */
export function useInsumos(incluirInativos = false) {
  return useQuery({
    queryKey: [RAIZ, 'insumos', incluirInativos],
    queryFn: ({ signal }) =>
      apiClient.get<z.infer<typeof InsumoListaSaida>>('/estoque-insumos', {
        schema: InsumoListaSaida,
        query: { incluir_inativos: incluirInativos },
        signal,
      }),
    select: (d) => d.itens,
  })
}

export function useCriarInsumo() {
  const invalidar = useInvalidarRaiz()
  return useMutation<InsumoDto, Error, CriarInsumoBody>({
    mutationFn: (body) => apiClient.post<InsumoDto>('/estoque-insumos', { body, schema: InsumoSaida }),
    onSettled: invalidar,
  })
}

export function useAtualizarInsumo() {
  const invalidar = useInvalidarRaiz()
  return useMutation<InsumoDto, Error, { id: string; body: AtualizarInsumoBody }>({
    mutationFn: ({ id, body }) =>
      apiClient.patch<InsumoDto>(`/estoque-insumos/${id}`, { body, schema: InsumoSaida }),
    onSettled: invalidar,
  })
}

/** POST /v1/estoque-insumos/movimentos: lanca entrada/saida/ajuste (insumo_id vai no corpo). */
export function useMovimentarInsumo() {
  const invalidar = useInvalidarRaiz()
  return useMutation<InsumoAplicado, Error, MovimentoBody>({
    mutationFn: (body) =>
      apiClient.post<InsumoAplicado>('/estoque-insumos/movimentos', {
        body,
        schema: MovimentoInsumoAplicadoSaida,
      }),
    onSettled: invalidar,
  })
}

/** GET /v1/estoque-insumos/:id/movimentos: ultimos movimentos do insumo (so quando habilitado). */
export function useMovimentosInsumo(insumoId: string | null, limite = 20) {
  return useQuery({
    queryKey: [RAIZ, 'insumos', 'movimentos', insumoId, limite],
    enabled: Boolean(insumoId),
    queryFn: ({ signal }) =>
      apiClient.get<z.infer<typeof MovimentoInsumoListaSaida>>(
        `/estoque-insumos/${insumoId}/movimentos`,
        { schema: MovimentoInsumoListaSaida, query: { limite }, signal },
      ),
    select: (d): MovimentoInsumoDto[] => d.itens,
  })
}

// ------------------------------------------------------------ ficha tecnica
/** GET /v1/ficha-tecnica/itens/:itemId: lista de insumos que 1 unidade do item consome. */
export function useFichaTecnica(itemId: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'ficha', itemId],
    enabled: Boolean(itemId),
    queryFn: ({ signal }) =>
      apiClient.get<FichaTecnica>(`/ficha-tecnica/itens/${itemId}`, {
        schema: FichaTecnicaSaida,
        signal,
      }),
  })
}

/** PUT /v1/ficha-tecnica/itens/:itemId: substitui a ficha inteira (lista vazia zera). */
export function useDefinirFichaTecnica() {
  const qc = useQueryClient()
  return useMutation<FichaTecnica, Error, { itemId: string; body: FichaBody }>({
    mutationFn: ({ itemId, body }) =>
      apiClient.put<FichaTecnica>(`/ficha-tecnica/itens/${itemId}`, { body, schema: FichaTecnicaSaida }),
    onSettled: (_data, _err, { itemId }) =>
      void qc.invalidateQueries({ queryKey: [RAIZ, 'ficha', itemId] }),
  })
}
