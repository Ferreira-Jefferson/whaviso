// Camada de dados do cardapio. Raiz de cache ['cardapio']: toda mutacao invalida a raiz,
// entao a arvore e a biblioteca de grupos sempre recarregam juntas. Dados so pelo api_client;
// a loja ativa vai no header x-loja-id (nunca no corpo). Contratos: @/shared/contracts/_generated/cardapio.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import {
  CardapioResolvidoSaida,
  CategoriaAtualizar,
  CategoriaCriar,
  CategoriaSaida,
  DisponibilidadeEntrada,
  DisponibilidadeSaida,
  GrupoAtualizar,
  GrupoCriar,
  GrupoMutacaoSaida,
  GruposSaida,
  ItemAtualizar,
  ItemCriar,
  ItemMutacaoSaida,
  OpcaoAtualizar,
  OpcaoCriar,
  OpcaoMutacaoSaida,
  type CardapioResolvidoSaida as ArvoreCardapio,
  type CategoriaSaida as Categoria,
} from '@/shared/contracts/_generated/cardapio'

export const RAIZ = 'cardapio'

// Corpos das mutacoes: inferidos da entrada dos schemas (defaults viram opcionais).
type CriarCategoriaBody = z.input<typeof CategoriaCriar>
type AtualizarCategoriaBody = z.input<typeof CategoriaAtualizar>
type CriarItemBody = z.input<typeof ItemCriar>
type AtualizarItemBody = z.input<typeof ItemAtualizar>
type CriarGrupoBody = z.input<typeof GrupoCriar>
type AtualizarGrupoBody = z.input<typeof GrupoAtualizar>
type CriarOpcaoBody = z.input<typeof OpcaoCriar>
type AtualizarOpcaoBody = z.input<typeof OpcaoAtualizar>
type DisponibilidadeBody = z.input<typeof DisponibilidadeEntrada>

type ItemMutacao = z.infer<typeof ItemMutacaoSaida>
type GrupoMutacao = z.infer<typeof GrupoMutacaoSaida>
type OpcaoMutacao = z.infer<typeof OpcaoMutacaoSaida>
type Disponibilidade = z.infer<typeof DisponibilidadeSaida>

// ------------------------------------------------------------------ leitura
/** GET /v1/cardapio: arvore resolvida do painel (inclui inativos, com flags). */
export function useCardapio() {
  return useQuery({
    queryKey: [RAIZ, 'arvore'],
    queryFn: ({ signal }) =>
      apiClient.get<ArvoreCardapio>('/cardapio', { schema: CardapioResolvidoSaida, signal }),
  })
}

/** GET /v1/cardapio/grupos: biblioteca de grupos de opcoes (com as opcoes de cada um). */
export function useGrupos() {
  return useQuery({
    queryKey: [RAIZ, 'grupos'],
    queryFn: ({ signal }) =>
      apiClient.get<z.infer<typeof GruposSaida>>('/cardapio/grupos', { schema: GruposSaida, signal }),
    select: (d) => d.grupos,
  })
}

function useInvalidarRaiz() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: [RAIZ] })
}

// --------------------------------------------------------------- categorias
export function useCriarCategoria() {
  const invalidar = useInvalidarRaiz()
  return useMutation<Categoria, Error, CriarCategoriaBody>({
    mutationFn: (body) => apiClient.post<Categoria>('/cardapio/categorias', { body, schema: CategoriaSaida }),
    onSettled: invalidar,
  })
}

export function useAtualizarCategoria() {
  const invalidar = useInvalidarRaiz()
  return useMutation<Categoria, Error, { id: string; body: AtualizarCategoriaBody }>({
    mutationFn: ({ id, body }) =>
      apiClient.patch<Categoria>(`/cardapio/categorias/${id}`, { body, schema: CategoriaSaida }),
    onSettled: invalidar,
  })
}

// -------------------------------------------------------------------- itens
export function useCriarItem() {
  const invalidar = useInvalidarRaiz()
  return useMutation<ItemMutacao, Error, CriarItemBody>({
    mutationFn: (body) => apiClient.post<ItemMutacao>('/cardapio/itens', { body, schema: ItemMutacaoSaida }),
    onSettled: invalidar,
  })
}

export function useAtualizarItem() {
  const invalidar = useInvalidarRaiz()
  return useMutation<ItemMutacao, Error, { id: string; body: AtualizarItemBody }>({
    mutationFn: ({ id, body }) =>
      apiClient.patch<ItemMutacao>(`/cardapio/itens/${id}`, { body, schema: ItemMutacaoSaida }),
    onSettled: invalidar,
  })
}

/** POST /v1/cardapio/itens/:id/disponibilidade: liga/desliga ou marca esgotado. */
export function useDisponibilidadeItem() {
  const invalidar = useInvalidarRaiz()
  return useMutation<Disponibilidade, Error, { id: string; body: DisponibilidadeBody }>({
    mutationFn: ({ id, body }) =>
      apiClient.post<Disponibilidade>(`/cardapio/itens/${id}/disponibilidade`, { body, schema: DisponibilidadeSaida }),
    onSettled: invalidar,
  })
}

// ------------------------------------------------------------------- grupos
export function useCriarGrupo() {
  const invalidar = useInvalidarRaiz()
  return useMutation<GrupoMutacao, Error, CriarGrupoBody>({
    mutationFn: (body) => apiClient.post<GrupoMutacao>('/cardapio/grupos', { body, schema: GrupoMutacaoSaida }),
    onSettled: invalidar,
  })
}

export function useAtualizarGrupo() {
  const invalidar = useInvalidarRaiz()
  return useMutation<GrupoMutacao, Error, { id: string; body: AtualizarGrupoBody }>({
    mutationFn: ({ id, body }) =>
      apiClient.patch<GrupoMutacao>(`/cardapio/grupos/${id}`, { body, schema: GrupoMutacaoSaida }),
    onSettled: invalidar,
  })
}

// ------------------------------------------------------------------- opcoes
export function useCriarOpcao() {
  const invalidar = useInvalidarRaiz()
  return useMutation<OpcaoMutacao, Error, { grupoId: string; body: CriarOpcaoBody }>({
    mutationFn: ({ grupoId, body }) =>
      apiClient.post<OpcaoMutacao>(`/cardapio/grupos/${grupoId}/opcoes`, { body, schema: OpcaoMutacaoSaida }),
    onSettled: invalidar,
  })
}

export function useAtualizarOpcao() {
  const invalidar = useInvalidarRaiz()
  return useMutation<OpcaoMutacao, Error, { id: string; body: AtualizarOpcaoBody }>({
    mutationFn: ({ id, body }) =>
      apiClient.patch<OpcaoMutacao>(`/cardapio/opcoes/${id}`, { body, schema: OpcaoMutacaoSaida }),
    onSettled: invalidar,
  })
}

/** POST /v1/cardapio/opcoes/:id/disponibilidade: liga/desliga ou marca esgotado. */
export function useDisponibilidadeOpcao() {
  const invalidar = useInvalidarRaiz()
  return useMutation<Disponibilidade, Error, { id: string; body: DisponibilidadeBody }>({
    mutationFn: ({ id, body }) =>
      apiClient.post<Disponibilidade>(`/cardapio/opcoes/${id}/disponibilidade`, { body, schema: DisponibilidadeSaida }),
    onSettled: invalidar,
  })
}
