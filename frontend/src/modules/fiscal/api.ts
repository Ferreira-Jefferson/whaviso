// Camada de dados do fiscal (raiz de cache ['fiscal']).
// A credencial do emissor e WRITE-ONLY: so o PUT /fiscal/config a envia; as leituras trazem apenas
// metadado (cnpj, regime, series, ambiente, ultimos4). Loja ativa no header x-loja-id.
// Contratos: @/shared/contracts/_generated/fiscal.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import {
  AutoEmissaoSaida,
  DocumentoFiscalSaida,
  DocumentosFiscaisSaida,
  FiscalConfigEstado,
  type AutoEmissaoResumo,
  type DocumentoFiscalDto,
  type DocumentoFiscalEmitirEntrada,
  FiscalConfigEntrada,
  type FiscalConfigPatch,
  ItemFiscalLinha,
  type ItemFiscalDadoEntrada,
  type ItemFiscalLinhaDto,
  ItensFiscaisSaida,
  type PedidoEmissivelDto,
  PedidosEmissiveisSaida,
  type StatusDocumentoFiscal,
} from '@/shared/contracts/_generated/fiscal'

export const RAIZ = 'fiscal'

type ConfigBody = z.input<typeof FiscalConfigEntrada>

/** GET /v1/fiscal/config: estado da configuracao (configurada=false quando nao ha). */
export function useFiscalConfig() {
  return useQuery({
    queryKey: [RAIZ, 'config'],
    queryFn: ({ signal }) =>
      apiClient.get<FiscalConfigEstado>('/fiscal/config', { schema: FiscalConfigEstado, signal }),
  })
}

/** PUT /v1/fiscal/config: cadastro inicial ou troca da credencial (so o dono). */
export function useDefinirFiscalConfig() {
  const qc = useQueryClient()
  return useMutation<FiscalConfigEstado, Error, ConfigBody>({
    mutationFn: (body) => apiClient.put<FiscalConfigEstado>('/fiscal/config', { body, schema: FiscalConfigEstado }),
    onSuccess: (estado) => qc.setQueryData([RAIZ, 'config'], estado),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'config'] }),
  })
}

/** PATCH /v1/fiscal/config: ajustes sem reenviar a credencial. */
export function useAjustarFiscalConfig() {
  const qc = useQueryClient()
  return useMutation<FiscalConfigEstado, Error, FiscalConfigPatch>({
    mutationFn: (body) => apiClient.patch<FiscalConfigEstado>('/fiscal/config', { body, schema: FiscalConfigEstado }),
    onSuccess: (estado) => qc.setQueryData([RAIZ, 'config'], estado),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'config'] }),
  })
}

/** GET /v1/fiscal/documentos: documentos da loja (status/chave/link), opcionalmente por status. */
export function useDocumentosFiscais(status: StatusDocumentoFiscal | null) {
  return useQuery({
    queryKey: [RAIZ, 'documentos', status],
    queryFn: ({ signal }) =>
      apiClient.get<z.infer<typeof DocumentosFiscaisSaida>>('/fiscal/documentos', {
        schema: DocumentosFiscaisSaida,
        query: { status, limite: 50 },
        signal,
      }),
    select: (d): DocumentoFiscalDto[] => d.itens,
  })
}

/** POST /v1/fiscal/documentos: pede a emissao (ou nova tentativa apos `erro`) de um documento. */
export function useEmitirDocumento() {
  const qc = useQueryClient()
  return useMutation<DocumentoFiscalDto, Error, DocumentoFiscalEmitirEntrada>({
    mutationFn: (body) => apiClient.post<DocumentoFiscalDto>('/fiscal/documentos', { body, schema: DocumentoFiscalSaida }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: [RAIZ, 'documentos'] })
      void qc.invalidateQueries({ queryKey: [RAIZ, 'pedidos-emissiveis'] })
    },
  })
}

/** GET /v1/fiscal/pedidos-emissiveis: pedidos concluidos sem NFC-e (candidatos a emissao). */
export function usePedidosEmissiveis() {
  return useQuery({
    queryKey: [RAIZ, 'pedidos-emissiveis'],
    queryFn: ({ signal }) =>
      apiClient.get<z.infer<typeof PedidosEmissiveisSaida>>('/fiscal/pedidos-emissiveis', {
        schema: PedidosEmissiveisSaida,
        signal,
      }),
    select: (d): PedidoEmissivelDto[] => d.itens,
  })
}

/** POST /v1/fiscal/documentos/auto: emite NFC-e em lote para os pedidos concluidos (auto ligado). */
export function useEmitirAuto() {
  const qc = useQueryClient()
  return useMutation<AutoEmissaoResumo, Error, void>({
    mutationFn: () => apiClient.post<AutoEmissaoResumo>('/fiscal/documentos/auto', { schema: AutoEmissaoSaida }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: [RAIZ, 'documentos'] })
      void qc.invalidateQueries({ queryKey: [RAIZ, 'pedidos-emissiveis'] })
    },
  })
}

/** GET /v1/fiscal/itens: itens do catalogo com o dado fiscal e a flag `completo`. */
export function useItensFiscais() {
  return useQuery({
    queryKey: [RAIZ, 'itens'],
    queryFn: ({ signal }) =>
      apiClient.get<z.infer<typeof ItensFiscaisSaida>>('/fiscal/itens', { schema: ItensFiscaisSaida, signal }),
    select: (d): ItemFiscalLinhaDto[] => d.itens,
  })
}

/** PUT /v1/fiscal/itens/:itemId: cadastra/ajusta o dado fiscal de um item. */
export function useDefinirItemFiscal() {
  const qc = useQueryClient()
  return useMutation<ItemFiscalLinhaDto, Error, { itemId: string; dados: ItemFiscalDadoEntrada }>({
    mutationFn: ({ itemId, dados }) =>
      apiClient.put<ItemFiscalLinhaDto>(`/fiscal/itens/${itemId}`, { body: dados, schema: ItemFiscalLinha }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'itens'] }),
  })
}
