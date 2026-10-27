// Camada de dados da agenda de pedidos (raiz de cache ['agendamento']). Janela (futuro/liberar/
// atrasado) e calculada no servidor a cada consulta; o cliente so filtra e exibe. Loja ativa no
// header x-loja-id. Contratos: @/shared/contracts/_generated/agendamento.
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import {
  AgendamentoDefinirEntrada,
  AgendamentoSaida,
  AgendamentosSaida,
  type AgendamentoDefinir,
  type AgendamentoDto,
  type JanelaAgendamentoValor,
} from '@/shared/contracts/_generated/agendamento'

export const RAIZ = 'agendamento'

interface Filtro {
  janela: JanelaAgendamentoValor | null
  antecedenciaMin: number
}

/** GET /v1/agendamento: agenda paginada por cursor (50 por pagina), mais cedo primeiro. */
export function useAgenda({ janela, antecedenciaMin }: Filtro) {
  return useInfiniteQuery({
    queryKey: [RAIZ, 'agenda', janela, antecedenciaMin],
    initialPageParam: null as string | null,
    queryFn: ({ signal, pageParam }) =>
      apiClient.get<z.infer<typeof AgendamentosSaida>>('/agendamento', {
        schema: AgendamentosSaida,
        query: { antecedencia_min: antecedenciaMin, janela, cursor: pageParam, limite: 50 },
        signal,
      }),
    getNextPageParam: (ultima) => ultima.proximoCursor,
    select: (d): AgendamentoDto[] => d.pages.flatMap((p) => p.itens),
  })
}

function useInvalidarAgenda() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: [RAIZ] })
}

/** PUT /v1/agendamento/:pedidoId: define (ou muda) o horario agendado do pedido. */
export function useDefinirAgendamento() {
  const invalidar = useInvalidarAgenda()
  return useMutation<AgendamentoDto, Error, { pedidoId: string; body: AgendamentoDefinir }>({
    mutationFn: ({ pedidoId, body }) =>
      apiClient.put<AgendamentoDto>(`/agendamento/${pedidoId}`, {
        body: AgendamentoDefinirEntrada.parse(body),
        schema: AgendamentoSaida,
      }),
    onSettled: invalidar,
  })
}

/** DELETE /v1/agendamento/:pedidoId: limpa o agendamento (o pedido volta a ser imediato). */
export function useLimparAgendamento() {
  const invalidar = useInvalidarAgenda()
  return useMutation<AgendamentoDto, Error, string>({
    mutationFn: (pedidoId) =>
      apiClient.delete<AgendamentoDto>(`/agendamento/${pedidoId}`, { schema: AgendamentoSaida }),
    onSettled: invalidar,
  })
}
