// Camada de dados do salao (mesas + comandas). Raiz de cache ['salao']: toda mutacao
// invalida a raiz, entao a grade de mesas e o detalhe da comanda aberta recarregam juntos.
// Dados so pelo api_client; a loja ativa vai no header x-loja-id (nunca no corpo).
// Contratos: @/shared/contracts/_generated/salao (nao redefinir). Preco NUNCA entra no
// corpo: o servidor calcula a partir do cardapio (snapshot). Dinheiro em centavos.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import {
  ComandaAbrirEntrada,
  ComandaItemEntrada,
  ComandaSaida,
  MesaAtualizarEntrada,
  MesaCriarEntrada,
  MesaListaSaida,
  MesaSaida,
  type ComandaSaida as Comanda,
  type MesaSaida as Mesa,
} from '@/shared/contracts/_generated/salao'

export const RAIZ = 'salao'

// Corpos das mutacoes: inferidos da entrada dos schemas (defaults/optionals preservados).
type CriarMesaBody = z.input<typeof MesaCriarEntrada>
type AtualizarMesaBody = z.input<typeof MesaAtualizarEntrada>
type AbrirComandaBody = z.input<typeof ComandaAbrirEntrada>
type LancarItemBody = z.input<typeof ComandaItemEntrada>

type ListaMesas = z.infer<typeof MesaListaSaida>

function useInvalidarRaiz() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: [RAIZ] })
}

// ------------------------------------------------------------------ leitura
/** GET /v1/salao/mesas: mesas da loja + a comanda aberta de cada uma (se houver). */
export function useMesas() {
  return useQuery({
    queryKey: [RAIZ, 'mesas'],
    queryFn: ({ signal }) =>
      apiClient.get<ListaMesas>('/salao/mesas', { schema: MesaListaSaida, signal }),
    select: (d) => d.itens,
  })
}

/** GET /v1/salao/comandas/:id: detalhe da comanda (itens lancados + total). */
export function useComanda(id: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'comanda', id],
    enabled: id != null,
    queryFn: ({ signal }) =>
      apiClient.get<Comanda>(`/salao/comandas/${id}`, { schema: ComandaSaida, signal }),
  })
}

// -------------------------------------------------------------------- mesas
export function useCriarMesa() {
  const invalidar = useInvalidarRaiz()
  return useMutation<Mesa, Error, CriarMesaBody>({
    mutationFn: (body) => apiClient.post<Mesa>('/salao/mesas', { body, schema: MesaSaida }),
    onSettled: invalidar,
  })
}

export function useAtualizarMesa() {
  const invalidar = useInvalidarRaiz()
  return useMutation<Mesa, Error, { id: string; body: AtualizarMesaBody }>({
    mutationFn: ({ id, body }) =>
      apiClient.patch<Mesa>(`/salao/mesas/${id}`, { body, schema: MesaSaida }),
    onSettled: invalidar,
  })
}

// ----------------------------------------------------------------- comandas
/** POST /v1/salao/comandas: abre uma comanda numa mesa livre. Devolve a comanda nova. */
export function useAbrirComanda() {
  const invalidar = useInvalidarRaiz()
  return useMutation<Comanda, Error, AbrirComandaBody>({
    mutationFn: (body) => apiClient.post<Comanda>('/salao/comandas', { body, schema: ComandaSaida }),
    onSettled: invalidar,
  })
}

/** POST /v1/salao/comandas/:id/itens: lanca um item (por item_id + quantidade). */
export function useLancarItem() {
  const invalidar = useInvalidarRaiz()
  return useMutation<Comanda, Error, { id: string; body: LancarItemBody }>({
    mutationFn: ({ id, body }) =>
      apiClient.post<Comanda>(`/salao/comandas/${id}/itens`, { body, schema: ComandaSaida }),
    onSettled: invalidar,
  })
}

/** POST /v1/salao/comandas/:id/fechar: encerra a comanda (mesa volta a ficar livre). */
export function useFecharComanda() {
  const invalidar = useInvalidarRaiz()
  return useMutation<Comanda, Error, { id: string }>({
    mutationFn: ({ id }) => apiClient.post<Comanda>(`/salao/comandas/${id}/fechar`, { schema: ComandaSaida }),
    onSettled: invalidar,
  })
}
