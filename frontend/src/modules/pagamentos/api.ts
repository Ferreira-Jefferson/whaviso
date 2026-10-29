// Camada de dados de pagamentos (raiz de cache ['pagamentos']).
//  - A chave Pix e WRITE-ONLY: `useDefinirPix` so envia; as leituras devolvem apenas metadado
//    (tipo, titular, cidade, ultimos4). Nada da chave fica em cache nem em estado depois do envio.
//  - O `br_code` (copia e cola) vem em PagamentoSaida de proposito e so e exibido para copiar:
//    nunca vai para log, URL ou storage.
// Loja ativa no header x-loja-id. Contratos: @/shared/contracts/_generated/pagamentos.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import {
  ListaPagamentosSaida,
  LojaPixEntrada,
  LojaPixEstadoResposta,
  PagamentoSaida,
  type LojaPixEstado,
} from '@/shared/contracts/_generated/pagamentos'
import type { StatusPagamento } from '@/shared/contracts/_generated/enums'

export const RAIZ = 'pagamentos'

type PixBody = z.input<typeof LojaPixEntrada>
type Pagamento = z.infer<typeof PagamentoSaida>

/** GET /v1/pagamentos/pix: metadado da chave (ou null se nao cadastrada). */
export function usePixEstado() {
  return useQuery({
    queryKey: [RAIZ, 'pix'],
    queryFn: ({ signal }) =>
      apiClient.get<z.infer<typeof LojaPixEstadoResposta>>('/pagamentos/pix', {
        schema: LojaPixEstadoResposta,
        signal,
      }),
    select: (d): LojaPixEstado | null => d.pix,
  })
}

/** PUT /v1/pagamentos/pix: cadastra ou troca a chave (dono/gerente). A resposta so tem metadado. */
export function useDefinirPix() {
  const qc = useQueryClient()
  return useMutation<z.infer<typeof LojaPixEstadoResposta>, Error, PixBody>({
    mutationFn: (body) =>
      apiClient.put<z.infer<typeof LojaPixEstadoResposta>>('/pagamentos/pix', {
        body,
        schema: LojaPixEstadoResposta,
      }),
    onSuccess: (resp) => qc.setQueryData([RAIZ, 'pix'], resp),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'pix'] }),
  })
}

/** GET /v1/pagamentos: cobrancas da loja, opcionalmente por status. */
export function usePagamentos(status: StatusPagamento | null) {
  return useQuery({
    queryKey: [RAIZ, 'lista', status],
    queryFn: ({ signal }) =>
      apiClient.get<z.infer<typeof ListaPagamentosSaida>>('/pagamentos', {
        schema: ListaPagamentosSaida,
        query: { status },
        signal,
      }),
    select: (d): Pagamento[] => d.pagamentos,
  })
}

function useInvalidarLista() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: [RAIZ, 'lista'] })
}

/** POST /v1/pagamentos/:id/conciliar: marca como pago (idempotente). */
export function useConciliarPagamento() {
  const invalidar = useInvalidarLista()
  return useMutation<Pagamento, Error, string>({
    mutationFn: (id) =>
      apiClient.post<Pagamento>(`/pagamentos/${id}/conciliar`, { body: {}, schema: PagamentoSaida }),
    onSettled: invalidar,
  })
}

/** POST /v1/pagamentos/:id/cancelar: cancela uma cobranca pendente. */
export function useCancelarPagamento() {
  const invalidar = useInvalidarLista()
  return useMutation<Pagamento, Error, string>({
    mutationFn: (id) => apiClient.post<Pagamento>(`/pagamentos/${id}/cancelar`, { schema: PagamentoSaida }),
    onSettled: invalidar,
  })
}

// ---- Config de recebimento (modo do Pix + quem paga a taxa) ---------------------------------
// Contrato proprio do front (espelha a api; nao e gerado, pois o backend o mantem local ao modulo).

export const PagamentoConfig = z.object({
  pix_modo: z.enum(['chave_propria', 'intermediado']),
  encargo_modo: z.enum(['absorve', 'repassa']),
  cartao_habilitado: z.boolean(),
  atualizado_em: z.string().nullable(),
})
export type PagamentoConfig = z.infer<typeof PagamentoConfig>
export type PagamentoConfigPatch = Partial<Pick<PagamentoConfig, 'pix_modo' | 'encargo_modo' | 'cartao_habilitado'>>

/** GET /v1/pagamentos/config: modo do Pix e quem paga a taxa (default se nunca salvo). */
export function useConfigPagamento() {
  return useQuery({
    queryKey: [RAIZ, 'config'],
    queryFn: ({ signal }) =>
      apiClient.get<PagamentoConfig>('/pagamentos/config', { schema: PagamentoConfig, signal }),
  })
}

/** PUT /v1/pagamentos/config: salva a config de recebimento (dono/gerente). */
export function useSalvarConfigPagamento() {
  const qc = useQueryClient()
  return useMutation<PagamentoConfig, Error, PagamentoConfigPatch>({
    mutationFn: (body) =>
      apiClient.put<PagamentoConfig>('/pagamentos/config', { body, schema: PagamentoConfig }),
    onSuccess: (resp) => qc.setQueryData([RAIZ, 'config'], resp),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'config'] }),
  })
}
