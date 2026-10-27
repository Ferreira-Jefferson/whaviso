// Camada de dados do modulo motoboys: cadastro de entrega (veiculo, placa, Pix) e fechamento
// do dia (entregas + ajustes manuais). Estado de servidor via TanStack Query; dados so pelo
// api_client. Raiz de cache ['motoboys']. A loja vem do header x-loja-id, nunca do corpo.
// Dinheiro em centavos (inteiro); datas de negocio 'YYYY-MM-DD' em America/Sao_Paulo.
//
// Mapa REAL do backend (backend/apps/api/src/modules/motoboys, prefixo /v1/motoboys):
//   GET   /motoboys                       lista { itens } (query: incluir_inativos=true)
//   POST  /motoboys                       cadastra (pessoa_id + veiculo/placa/Pix) -> MotoboySaida
//   PATCH /motoboys/:id                   edita veiculo/placa/Pix -> MotoboySaida
//   POST  /motoboys/:id/ativar|desativar
//   POST  /motoboys/:id/lancamentos       ajuste manual (valor com sinal) -> LancamentoSaida
//   GET   /motoboys/fechamentos?data=     fechamento do dia (materializa e devolve o total)
//   POST  /motoboys/fechamentos/:id/pagar { total_centavos } (409 se o total mudou)
// PII: telefone e Pix so saem MASCARADOS (ultimos 4). "Revelar Pix" NAO e usado nesta tela:
// o cadastro nunca reexibe o Pix em claro.
//
// Pessoas: o motoboy e uma PESSOA de cargo 'motoboy'. `usePessoasMotoboy` le GET /v1/pessoas
// pelo api_client (chamada HTTP, nao import do modulo pessoas) e filtra pela chave do cargo.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  FechamentoDia,
  LancamentoSaida,
  MotoboyListaSaida,
  MotoboySaida,
  type FechamentoDiaDto,
  type FechamentoLinhaDto,
  type LancamentoDto,
  type LancamentoNovo,
  type MotoboyDto,
  type MotoboyNovo,
  type MotoboyPatch,
} from '@/shared/contracts/_generated/motoboys'
import { PessoaListaSaida } from '@/shared/contracts/_generated/pessoas'
import type { z } from 'zod'

export const RAIZ = 'motoboys'

export type Motoboy = MotoboyDto
export type Fechamento = FechamentoDiaDto
export type FechamentoLinha = FechamentoLinhaDto
export type Lancamento = LancamentoDto
type PessoaLista = z.infer<typeof PessoaListaSaida>

/** GET /v1/motoboys. `incluirInativos` traz tambem os arquivados. */
export function useMotoboys(incluirInativos: boolean) {
  return useQuery({
    queryKey: [RAIZ, 'lista', incluirInativos],
    queryFn: ({ signal }) =>
      apiClient.get<{ itens: Motoboy[] }>('/motoboys', {
        query: { incluir_inativos: incluirInativos ? 'true' : undefined },
        schema: MotoboyListaSaida,
        signal,
      }),
  })
}

/** Pessoas ativas de cargo 'motoboy' (candidatas ao cadastro de entrega). */
export function usePessoasMotoboy(habilitado: boolean) {
  return useQuery({
    queryKey: [RAIZ, 'pessoas-motoboy'],
    enabled: habilitado,
    queryFn: async ({ signal }) => {
      const r = await apiClient.get<PessoaLista>('/pessoas', { schema: PessoaListaSaida, signal })
      return r.itens.filter((p) => p.cargo_chave === 'motoboy' && p.ativo)
    },
  })
}

function useInvalidar() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: [RAIZ] })
}

/** POST /v1/motoboys. */
export function useCriarMotoboy() {
  const invalidar = useInvalidar()
  return useMutation<Motoboy, Error, MotoboyNovo>({
    mutationFn: (body) => apiClient.post<Motoboy>('/motoboys', { body, schema: MotoboySaida }),
    onSuccess: invalidar,
  })
}

/** PATCH /v1/motoboys/:id. */
export function useAtualizarMotoboy() {
  const invalidar = useInvalidar()
  return useMutation<Motoboy, Error, { id: string; patch: MotoboyPatch }>({
    mutationFn: ({ id, patch }) => apiClient.patch<Motoboy>(`/motoboys/${id}`, { body: patch, schema: MotoboySaida }),
    onSuccess: invalidar,
  })
}

/** POST /v1/motoboys/:id/ativar|desativar. */
export function useAlternarMotoboy() {
  const invalidar = useInvalidar()
  return useMutation<Motoboy, Error, { id: string; ativar: boolean }>({
    mutationFn: ({ id, ativar }) =>
      apiClient.post<Motoboy>(`/motoboys/${id}/${ativar ? 'ativar' : 'desativar'}`, { schema: MotoboySaida }),
    onSuccess: invalidar,
  })
}

/** GET /v1/motoboys/fechamentos?data=: fechamento do dia (total derivado dos lancamentos). */
export function useFechamentos(data: string) {
  return useQuery({
    queryKey: [RAIZ, 'fechamentos', data],
    queryFn: ({ signal }) =>
      apiClient.get<Fechamento>('/motoboys/fechamentos', { query: { data }, schema: FechamentoDia, signal }),
  })
}

/** POST /v1/motoboys/:id/lancamentos: ajuste manual com sinal (bonus, desconto). */
export function useLancarAjuste() {
  const invalidar = useInvalidar()
  return useMutation<Lancamento, Error, { motoboyId: string } & LancamentoNovo>({
    mutationFn: ({ motoboyId, ...body }) =>
      apiClient.post<Lancamento>(`/motoboys/${motoboyId}/lancamentos`, { body, schema: LancamentoSaida }),
    onSuccess: invalidar,
  })
}

/** POST /v1/motoboys/fechamentos/:id/pagar: confirma o total que o dono viu (409 se mudou). */
export function usePagarFechamento() {
  const invalidar = useInvalidar()
  return useMutation<unknown, Error, { id: string; totalCentavos: number }>({
    mutationFn: ({ id, totalCentavos }) =>
      apiClient.post<unknown>(`/motoboys/fechamentos/${id}/pagar`, { body: { total_centavos: totalCentavos } }),
    onSuccess: invalidar,
  })
}
