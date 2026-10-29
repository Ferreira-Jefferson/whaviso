// Camada de dados do modulo plataforma_cobranca: cobranca restaurante -> Whaviso. Duas
// audiencias: operador (assinaturas, faturas, jobs; rotas `semLoja`) e dono da loja
// (`/minha-fatura`, escopo de loja: envia x-loja-id normalmente). Este modulo NUNCA importa
// outro modulo. Raiz de cache ['plataforma_cobranca'].
//   GET   /v1/plataforma-cobranca/assinaturas?conta_id&status
//   POST  /v1/plataforma-cobranca/assinaturas
//   PATCH /v1/plataforma-cobranca/assinaturas/:id          (status/valor/vencimento)
//   GET   /v1/plataforma-cobranca/faturas?status&competencia&conta_id
//   POST  /v1/plataforma-cobranca/faturas/:id/pagar        { reativar }
//   POST  /v1/plataforma-cobranca/faturas/:id/cancelar
//   POST  /v1/plataforma-cobranca/cobranca/gerar-faturas   { competencia? }
//   POST  /v1/plataforma-cobranca/cobranca/apurar-atrasos
//   GET   /v1/plataforma-cobranca/minha-fatura             (dono da loja)
// Nomes de conta: o DTO de cobranca so tem conta_id; resolvemos nome por HTTP em
// `/plataforma-clientes/contas` (read-only, mesmo escopo de operador), sem importar o modulo.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  ApurarAtrasosResultado,
  AssinaturaDTO,
  AssinaturasLista,
  FaturaDTO,
  FaturasLista,
  GerarFaturasResultado,
  MinhaFaturaDTO,
  MinhasFaturasLista,
  type AssinaturaCriar,
  type AssinaturaPatch,
  type FaturaMarcarPaga,
  type GerarFaturasEntrada,
  type StatusAssinatura,
  type StatusFatura,
} from '@/shared/contracts/_generated/plataforma_cobranca'
import { PlanoDTO, PlanosLista, type PlanoCriar, type PlanoPatch } from './planos'
import { PlataformaContaPagina } from '@/shared/contracts/_generated/plataforma_clientes'

export const RAIZ = 'plataforma_cobranca'

const OP = { semLoja: true } as const

// ---------------------------------------------------------------------------------------------
// Assinaturas
// ---------------------------------------------------------------------------------------------
export function useAssinaturas(status: StatusAssinatura | undefined) {
  return useQuery({
    queryKey: [RAIZ, 'assinaturas', status ?? ''],
    queryFn: ({ signal }) =>
      apiClient.get<AssinaturaDTO[]>('/plataforma-cobranca/assinaturas', {
        query: { status },
        schema: AssinaturasLista,
        signal,
        ...OP,
      }),
  })
}

/** Assinatura muda faturas e (por trigger) a suspensao: invalida a raiz toda. */
function useInvalidarRaiz() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: [RAIZ] })
}

export function useCriarAssinatura() {
  const invalidar = useInvalidarRaiz()
  return useMutation<AssinaturaDTO, Error, AssinaturaCriar>({
    mutationFn: (body) =>
      apiClient.post<AssinaturaDTO>('/plataforma-cobranca/assinaturas', { body, schema: AssinaturaDTO, ...OP }),
    onSettled: invalidar,
  })
}

export function useAlterarAssinatura() {
  const invalidar = useInvalidarRaiz()
  return useMutation<AssinaturaDTO, Error, { id: string; patch: AssinaturaPatch }>({
    mutationFn: ({ id, patch }) =>
      apiClient.patch<AssinaturaDTO>(`/plataforma-cobranca/assinaturas/${id}`, {
        body: patch,
        schema: AssinaturaDTO,
        ...OP,
      }),
    onSettled: invalidar,
  })
}

// ---------------------------------------------------------------------------------------------
// Faturas
// ---------------------------------------------------------------------------------------------
export interface FiltroFaturas {
  status?: StatusFatura
  /** 'YYYY-MM-01'. */
  competencia?: string
  contaId?: string
}

export function useFaturas(f: FiltroFaturas) {
  return useQuery({
    queryKey: [RAIZ, 'faturas', f.status ?? '', f.competencia ?? '', f.contaId ?? ''],
    queryFn: ({ signal }) =>
      apiClient.get<FaturaDTO[]>('/plataforma-cobranca/faturas', {
        query: { status: f.status, competencia: f.competencia, conta_id: f.contaId },
        schema: FaturasLista,
        signal,
        ...OP,
      }),
  })
}

export function usePagarFatura() {
  const invalidar = useInvalidarRaiz()
  return useMutation<FaturaDTO, Error, { id: string; body: FaturaMarcarPaga }>({
    mutationFn: ({ id, body }) =>
      apiClient.post<FaturaDTO>(`/plataforma-cobranca/faturas/${id}/pagar`, { body, schema: FaturaDTO, ...OP }),
    onSettled: invalidar,
  })
}

export function useCancelarFatura() {
  const invalidar = useInvalidarRaiz()
  return useMutation<FaturaDTO, Error, string>({
    mutationFn: (id) =>
      apiClient.post<FaturaDTO>(`/plataforma-cobranca/faturas/${id}/cancelar`, { schema: FaturaDTO, ...OP }),
    onSettled: invalidar,
  })
}

// ---------------------------------------------------------------------------------------------
// Jobs (execucao manual; idempotentes e com rate limit no servidor)
// ---------------------------------------------------------------------------------------------
export function useGerarFaturas() {
  const invalidar = useInvalidarRaiz()
  return useMutation<GerarFaturasResultado, Error, GerarFaturasEntrada>({
    mutationFn: (body) =>
      apiClient.post<GerarFaturasResultado>('/plataforma-cobranca/cobranca/gerar-faturas', {
        body,
        schema: GerarFaturasResultado,
        ...OP,
      }),
    onSettled: invalidar,
  })
}

export function useApurarAtrasos() {
  const invalidar = useInvalidarRaiz()
  return useMutation<ApurarAtrasosResultado, Error, void>({
    mutationFn: () =>
      apiClient.post<ApurarAtrasosResultado>('/plataforma-cobranca/cobranca/apurar-atrasos', {
        schema: ApurarAtrasosResultado,
        ...OP,
      }),
    onSettled: invalidar,
  })
}

// ---------------------------------------------------------------------------------------------
// Contas (so leitura, para mostrar nome em vez de id e escolher a conta de uma assinatura)
// ---------------------------------------------------------------------------------------------
/** Busca de contas por nome (>= 2 caracteres). Sem busca, nao consulta. */
export function useBuscaContas(busca: string) {
  const termo = busca.trim()
  return useQuery({
    queryKey: [RAIZ, 'contas', termo],
    enabled: termo.length >= 2,
    staleTime: 30_000,
    queryFn: ({ signal }) =>
      apiClient.get<PlataformaContaPagina>('/plataforma-clientes/contas', {
        query: { busca: termo, limite: 8 },
        schema: PlataformaContaPagina,
        signal,
        ...OP,
      }),
  })
}

/** Mapa id -> nome das contas mais recentes (melhor esforco: 100 contas; o resto cai no id curto). */
export function useNomesContas() {
  return useQuery({
    queryKey: [RAIZ, 'nomes_contas'],
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => {
      const pagina = await apiClient.get<PlataformaContaPagina>('/plataforma-clientes/contas', {
        query: { limite: 100 },
        schema: PlataformaContaPagina,
        signal,
        ...OP,
      })
      return new Map(pagina.itens.map((c) => [c.id, c.nome] as const))
    },
  })
}

// ---------------------------------------------------------------------------------------------
// Dono da loja
// ---------------------------------------------------------------------------------------------
/** GET /v1/plataforma-cobranca/minha-fatura: faturas da PROPRIA conta (403 se nao for dono). */
export function useMinhasFaturas() {
  return useQuery({
    queryKey: [RAIZ, 'minhas_faturas'],
    queryFn: ({ signal }) =>
      apiClient.get<MinhaFaturaDTO[]>('/plataforma-cobranca/minha-fatura', { schema: MinhasFaturasLista, signal }),
  })
}

// ---------------------------------------------------------------------------------------------
// Planos (catalogo; so admin da equipe: operador comum recebe 403)
//   GET/POST /v1/plataforma-cobranca/planos · PATCH /v1/plataforma-cobranca/planos/:id
// ---------------------------------------------------------------------------------------------
export function usePlanos() {
  return useQuery({
    queryKey: [RAIZ, 'planos'],
    queryFn: ({ signal }) =>
      apiClient.get<PlanoDTO[]>('/plataforma-cobranca/planos', { schema: PlanosLista, signal, ...OP }),
  })
}

export function useCriarPlano() {
  const invalidar = useInvalidarRaiz()
  return useMutation<PlanoDTO, Error, PlanoCriar>({
    mutationFn: (body) => apiClient.post<PlanoDTO>('/plataforma-cobranca/planos', { body, schema: PlanoDTO, ...OP }),
    onSettled: invalidar,
  })
}

export function useAlterarPlano() {
  const invalidar = useInvalidarRaiz()
  return useMutation<PlanoDTO, Error, { id: string; patch: PlanoPatch }>({
    mutationFn: ({ id, patch }) =>
      apiClient.patch<PlanoDTO>(`/plataforma-cobranca/planos/${id}`, { body: patch, schema: PlanoDTO, ...OP }),
    onSettled: invalidar,
  })
}
