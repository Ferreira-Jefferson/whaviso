// Camada de dados do módulo painel: GET /v1/painel/resumo + /v1/painel/pendencias
// + a LISTA de combinados (GET /v1/avisos). A lista vive aqui (e não no módulo avisos)
// porque a página unificada /app (Painel) mostra totais + lista juntos e o lint
// feature-first proíbe o painel importar o módulo avisos.
// Estado de servidor 100% via TanStack Query; nunca supabase.from().
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import {
  avisoSchema,
  listaCategoriasResposta,
  painelMetricasResposta,
  painelPendenciasResposta,
  painelResumoResposta,
  type Categoria,
  type DirecaoAviso,
  type PainelMetricasResposta,
  type PainelPendenciasResposta,
  type PainelResumoResposta,
  type PapelAviso,
  type StatusAviso,
} from '@/shared/contracts'

export interface PeriodoResumo {
  de?: string
  ate?: string
}

export const painelKeys = {
  todos: ['painel'] as const,
  resumo: (periodo: PeriodoResumo) => ['painel', 'resumo', periodo] as const,
  pendencias: ['painel', 'pendencias'] as const,
  metricas: (periodo: PeriodoResumo) => ['painel', 'metricas', periodo] as const,
}

/** GET /v1/painel/metricas: saúde do negócio (papel cobrador), calculada no backend. */
export function usePainelMetricas(periodo: PeriodoResumo = {}) {
  return useQuery({
    queryKey: painelKeys.metricas(periodo),
    queryFn: ({ signal }) =>
      apiClient.get<PainelMetricasResposta>('/painel/metricas', {
        schema: painelMetricasResposta,
        query: { de: periodo.de, ate: periodo.ate },
        signal,
      }),
  })
}

/** GET /v1/painel/resumo: totais por PAPEL (centavos) calculados no backend. */
export function usePainelResumo(periodo: PeriodoResumo) {
  return useQuery({
    queryKey: painelKeys.resumo(periodo),
    queryFn: ({ signal }) =>
      apiClient.get<PainelResumoResposta>('/painel/resumo', {
        schema: painelResumoResposta,
        query: { de: periodo.de, ate: periodo.ate },
        signal,
      }),
  })
}

// E16: categorias do usuário, para o filtro do painel. Rota por string (o painel não
// importa o módulo categorias/avisos; fronteira do lint). Raiz ['categorias'] compartilhada.
export function useCategorias() {
  return useQuery({
    queryKey: ['categorias'],
    queryFn: ({ signal }) =>
      apiClient.get<Categoria[]>('/categorias', { schema: listaCategoriasResposta, signal }),
  })
}

/** GET /v1/painel/pendencias: "precisa de você" (aguarda ação do usuário). */
export function usePainelPendencias() {
  return useQuery({
    queryKey: painelKeys.pendencias,
    queryFn: ({ signal }) =>
      apiClient.get<PainelPendenciasResposta>('/painel/pendencias', {
        schema: painelPendenciasResposta,
        signal,
      }),
  })
}

// ---------------------------------------------------------------------------
// Lista de combinados (GET /v1/avisos), H9.1/H9.3. A listagem do backend é um
// envelope paginado (não um array nu): { itens, total, page, per_page }.
// ---------------------------------------------------------------------------
const listaAvisosResposta = z.object({
  itens: z.array(avisoSchema),
  total: z.number().int(),
  page: z.number().int(),
  per_page: z.number().int(),
})
export type ListaAvisosResposta = z.infer<typeof listaAvisosResposta>

export interface FiltrosLista {
  status?: StatusAviso
  direcao?: DirecaoAviso
  /** H9.1: papel do usuário (cobre o invertido), não a direção. */
  papel?: PapelAviso
  /** H9.3/H9.8: faixa decidida no servidor (ativos/agenda/historico). */
  grupo?: 'ativos' | 'agenda' | 'historico'
  /** H9.3: busca por nome da outra ponta OU motivo (server-side). */
  busca?: string
  ordenar?: 'data_combinada' | 'criado_em'
  dir?: 'asc' | 'desc'
  /** E9 H9.6: período. Com de/ate, a lista vem desmembrada por OCORRÊNCIA (uma linha por
   *  ocorrência do recorrente, com data/status próprios); sem de/ate, uma linha por combinado. */
  de?: string
  ate?: string
  /** E16 H16.4: filtra por uma categoria (id) ou pelos sem categoria. */
  categoria_id?: string
  sem_categoria?: boolean
  page?: number
  per_page?: number
}

// CONTRATO DE STRING ENTRE MÓDULOS: a raiz ['avisos'] é compartilhada com o módulo
// avisos. As mutations em modules/avisos/api.ts invalidam ['avisos'] (prefixo), então
// uma ação lá (criar/cancelar/pausar/etc.) refaz esta lista sem que os módulos se
// importem (fronteira do lint). Não renomear a raiz sem ajustar os dois lados.
const avisosListaKey = (filtros: FiltrosLista) => ['avisos', 'list', filtros] as const

/** GET /v1/avisos: lista paginada por PAPEL (filtros por faixa/situação/busca). */
export function useAvisos(filtros: FiltrosLista) {
  return useQuery({
    queryKey: avisosListaKey(filtros),
    queryFn: ({ signal }) =>
      apiClient.get<ListaAvisosResposta>('/avisos', {
        schema: listaAvisosResposta,
        query: {
          status: filtros.status,
          direcao: filtros.direcao,
          papel: filtros.papel,
          grupo: filtros.grupo,
          busca: filtros.busca,
          ordenar: filtros.ordenar,
          dir: filtros.dir,
          de: filtros.de,
          ate: filtros.ate,
          categoria_id: filtros.categoria_id,
          sem_categoria: filtros.sem_categoria,
          page: filtros.page,
          per_page: filtros.per_page,
        },
        signal,
      }),
    placeholderData: keepPreviousData,
  })
}
