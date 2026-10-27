// Camada de dados da importacao de cardapio (raiz de cache ['cardapio_importacao']).
// Fluxo: POST (base64) enfileira -> a extracao roda no servidor (assincrona) -> a tela faz polling
// ate `rascunho_pronto` -> o dono edita (PATCH) e aprova (POST aprovar, devolve o LOTE) -> o lote e
// aplicado no cardapio pelos endpoints do modulo cardapio (ver aplicarLote.ts). A importacao nunca
// escreve no cardapio por conta propria. Loja ativa no header x-loja-id.
// Contratos: @/shared/contracts/_generated/cardapio_importacao. O arquivo/rascunho nunca vai para log.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import {
  ImportacaoCardapioAprovadaSaida,
  ImportacaoCardapioCriada,
  ImportacaoCardapioDescartadaSaida,
  ImportacaoCardapioEstado,
  ImportacoesCardapioSaida,
  type ImportacaoCardapioResumo,
  type RascunhoCardapio,
} from '@/shared/contracts/_generated/cardapio_importacao'
import { STATUS_EM_ANDAMENTO } from './estados'

export const RAIZ = 'cardapio_importacao'
const INTERVALO_POLLING_MS = 4000

/** GET /v1/cardapio-importacao: jobs da loja; refaz a cada 4 s enquanto algum estiver em andamento. */
export function useImportacoes() {
  return useQuery({
    queryKey: [RAIZ, 'lista'],
    queryFn: ({ signal }) =>
      apiClient.get<z.infer<typeof ImportacoesCardapioSaida>>('/cardapio-importacao', {
        schema: ImportacoesCardapioSaida,
        signal,
      }),
    select: (d): ImportacaoCardapioResumo[] => d.itens,
    refetchInterval: (q) =>
      q.state.data?.itens.some((i) => STATUS_EM_ANDAMENTO.includes(i.status)) ? INTERVALO_POLLING_MS : false,
  })
}

/** GET /v1/cardapio-importacao/:id: estado + rascunho (so habilitado com id). */
export function useImportacao(id: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'detalhe', id],
    enabled: Boolean(id),
    queryFn: ({ signal }) =>
      apiClient.get<ImportacaoCardapioEstado>(`/cardapio-importacao/${id}`, {
        schema: ImportacaoCardapioEstado,
        signal,
      }),
    refetchInterval: (q) =>
      q.state.data && STATUS_EM_ANDAMENTO.includes(q.state.data.status) ? INTERVALO_POLLING_MS : false,
  })
}

function useInvalidarRaiz() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: [RAIZ] })
}

/** POST /v1/cardapio-importacao: envia o arquivo (base64) e enfileira a leitura. */
export function useEnviarArquivo() {
  const invalidar = useInvalidarRaiz()
  return useMutation<ImportacaoCardapioCriada, Error, string>({
    mutationFn: (arquivo_base64) =>
      apiClient.post<ImportacaoCardapioCriada>('/cardapio-importacao', {
        body: { arquivo_base64 },
        schema: ImportacaoCardapioCriada,
      }),
    onSettled: invalidar,
  })
}

/** PATCH /v1/cardapio-importacao/:id: salva a edicao do rascunho (so em `rascunho_pronto`). */
export function useEditarRascunho() {
  const invalidar = useInvalidarRaiz()
  return useMutation<ImportacaoCardapioEstado, Error, { id: string; rascunho: RascunhoCardapio }>({
    mutationFn: ({ id, rascunho }) =>
      apiClient.patch<ImportacaoCardapioEstado>(`/cardapio-importacao/${id}`, {
        body: { rascunho },
        schema: ImportacaoCardapioEstado,
      }),
    onSettled: invalidar,
  })
}

/** POST /v1/cardapio-importacao/:id/aprovar: marca aprovada e devolve o LOTE a criar no cardapio. */
export function useAprovar() {
  const invalidar = useInvalidarRaiz()
  return useMutation<ImportacaoCardapioAprovadaSaida, Error, string>({
    mutationFn: (id) =>
      apiClient.post<ImportacaoCardapioAprovadaSaida>(`/cardapio-importacao/${id}/aprovar`, {
        schema: ImportacaoCardapioAprovadaSaida,
      }),
    onSettled: invalidar,
  })
}

/** POST /v1/cardapio-importacao/:id/descartar: descarta (fila, pronto ou erro). */
export function useDescartar() {
  const invalidar = useInvalidarRaiz()
  return useMutation<z.infer<typeof ImportacaoCardapioDescartadaSaida>, Error, string>({
    mutationFn: (id) =>
      apiClient.post<z.infer<typeof ImportacaoCardapioDescartadaSaida>>(`/cardapio-importacao/${id}/descartar`, {
        schema: ImportacaoCardapioDescartadaSaida,
      }),
    onSettled: invalidar,
  })
}

