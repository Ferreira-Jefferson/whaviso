// Camada de dados do modulo plataforma_painel (console do operador Whaviso): read-model de
// crescimento da base. So agregados (SEC-003). Rotas de OPERADOR: nao enviam x-loja-id
// (`semLoja`). Este modulo NUNCA importa outro modulo. Raiz de cache ['plataforma_painel'].
//   GET /v1/plataforma-painel/resumo          KPIs do mes corrente
//   GET /v1/plataforma-painel/serie?meses=N   serie mensal (1..24)
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import { PainelResumo, PainelSerie } from '@/shared/contracts/_generated/plataforma_painel'

export const RAIZ = 'plataforma_painel'

/** Os agregados vem de cache de 60 s no servidor; nao faz sentido repetir antes disso. */
const STALE_MS = 60_000

export function usePainelResumo() {
  return useQuery({
    queryKey: [RAIZ, 'resumo'],
    staleTime: STALE_MS,
    queryFn: ({ signal }) =>
      apiClient.get<PainelResumo>('/plataforma-painel/resumo', { schema: PainelResumo, signal, semLoja: true }),
  })
}

export function usePainelSerie(meses: number) {
  return useQuery({
    queryKey: [RAIZ, 'serie', meses],
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiClient.get<PainelSerie>('/plataforma-painel/serie', {
        query: { meses },
        schema: PainelSerie,
        signal,
        semLoja: true,
      }),
  })
}
