// Camada de dados do modulo contas a pagar: cadastro de FORNECEDORES e LANCAMENTOS MANUAIS a pagar
// (fornecedor ou pessoa). Estado de servidor via TanStack Query; dados so pelo api_client. Raiz de
// cache ['contas-pagar']. A loja vem do header x-loja-id, nunca do corpo. Dinheiro em centavos;
// datas de negocio 'YYYY-MM-DD' em America/Sao_Paulo. Este modulo NUNCA importa outro modulo.
//
// Mapa REAL do backend (backend/apps/api/src/modules/contas_pagar, prefixo /v1/contas-pagar):
//   GET   /contas-pagar                 lista fornecedores { itens } (query: incluir_inativos=true)
//   POST  /contas-pagar                 cria fornecedor -> FornecedorSaida (201)
//   GET|PATCH /contas-pagar/:id         detalhe/edita fornecedor
//   POST  /contas-pagar/:id/ativar|desativar
//   POST  /contas-pagar/:id/telefone/revelar   telefone em claro (dono/gerente, no-store)
//   GET   /contas-pagar/contas          lista contas { itens } (filtros credor_tipo/status/de/ate)
//   POST  /contas-pagar/contas          lancamento -> ContaPagarSaida (201)
//   PATCH /contas-pagar/contas/:id      edita enquanto a_pagar (409 se paga)
//   POST  /contas-pagar/contas/:id/pagar { valor_centavos } visto (409 total_divergente)
// PII: telefone do fornecedor so sai MASCARADO (ultimos 4); o claro so via revelar.
//
// Pessoas (credor tipo pessoa): lidas por GET /v1/pessoas pelo api_client (chamada HTTP, nao import
// do modulo pessoas).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import {
  ContaPagarListaSaida,
  ContaPagarSaida,
  type ContaPagarDto,
  type ContaPagarNovo,
  type ContaPagarPatch,
} from '@/shared/contracts/_generated/contas_pagar'
import {
  FornecedorListaSaida,
  FornecedorSaida,
  FornecedorTelefoneSaida,
  type FornecedorDto,
  type FornecedorNovo,
  type FornecedorPatch,
} from '@/shared/contracts/_generated/fornecedores'
import { PessoaListaSaida } from '@/shared/contracts/_generated/pessoas'
import type { CredorTipo, StatusContaPagar } from '@/shared/contracts/_generated/enums'

export const RAIZ = 'contas-pagar'

export type Fornecedor = FornecedorDto
export type Conta = ContaPagarDto
type FornecedorLista = z.infer<typeof FornecedorListaSaida>
type ContaLista = z.infer<typeof ContaPagarListaSaida>
type PessoaLista = z.infer<typeof PessoaListaSaida>

export interface Credor {
  id: string
  nome: string
}

function useInvalidar() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: [RAIZ] })
}

// ---------------------------------------------------------------------------------------------
// Fornecedores
// ---------------------------------------------------------------------------------------------

/** GET /v1/contas-pagar: fornecedores da loja. `incluirInativos` traz tambem os arquivados. */
export function useFornecedores(incluirInativos: boolean) {
  return useQuery({
    queryKey: [RAIZ, 'fornecedores', incluirInativos],
    queryFn: ({ signal }) =>
      apiClient.get<FornecedorLista>('/contas-pagar', {
        query: { incluir_inativos: incluirInativos ? 'true' : undefined },
        schema: FornecedorListaSaida,
        signal,
      }),
  })
}

/** Fornecedores ativos, para o seletor de credor do lancamento. */
export function useFornecedoresAtivos(habilitado: boolean) {
  return useQuery({
    queryKey: [RAIZ, 'fornecedores', false],
    enabled: habilitado,
    queryFn: ({ signal }) =>
      apiClient.get<FornecedorLista>('/contas-pagar', { schema: FornecedorListaSaida, signal }),
    select: (r): Credor[] => r.itens.map((f) => ({ id: f.id, nome: f.nome })),
  })
}

/** POST /v1/contas-pagar: cadastra um fornecedor. */
export function useCriarFornecedor() {
  const invalidar = useInvalidar()
  return useMutation<Fornecedor, Error, FornecedorNovo>({
    mutationFn: (body) => apiClient.post<Fornecedor>('/contas-pagar', { body, schema: FornecedorSaida }),
    onSuccess: invalidar,
  })
}

/** PATCH /v1/contas-pagar/:id: edita um fornecedor. */
export function useAtualizarFornecedor() {
  const invalidar = useInvalidar()
  return useMutation<Fornecedor, Error, { id: string; patch: FornecedorPatch }>({
    mutationFn: ({ id, patch }) =>
      apiClient.patch<Fornecedor>(`/contas-pagar/${id}`, { body: patch, schema: FornecedorSaida }),
    onSuccess: invalidar,
  })
}

/** POST /v1/contas-pagar/:id/ativar|desativar: arquiva ou reativa um fornecedor. */
export function useAlternarFornecedor() {
  const invalidar = useInvalidar()
  return useMutation<Fornecedor, Error, { id: string; ativar: boolean }>({
    mutationFn: ({ id, ativar }) =>
      apiClient.post<Fornecedor>(`/contas-pagar/${id}/${ativar ? 'ativar' : 'desativar'}`, {
        schema: FornecedorSaida,
      }),
    onSuccess: invalidar,
  })
}

/** POST /v1/contas-pagar/:id/telefone/revelar: telefone em claro (dono/gerente, no-store). */
export function useRevelarTelefone() {
  return useMutation<string, Error, string>({
    mutationFn: async (id) => {
      const r = await apiClient.post<{ telefone: string }>(`/contas-pagar/${id}/telefone/revelar`, {
        schema: FornecedorTelefoneSaida,
      })
      return r.telefone
    },
  })
}

// ---------------------------------------------------------------------------------------------
// Contas a pagar (lancamentos manuais)
// ---------------------------------------------------------------------------------------------

export interface FiltroContas {
  credorTipo?: CredorTipo
  status?: StatusContaPagar
}

/** GET /v1/contas-pagar/contas: lancamentos da loja, com filtro por credor e status. */
export function useContas(filtro: FiltroContas) {
  return useQuery({
    queryKey: [RAIZ, 'contas', filtro.credorTipo ?? 'todos', filtro.status ?? 'todos'],
    queryFn: ({ signal }) =>
      apiClient.get<ContaLista>('/contas-pagar/contas', {
        query: { credor_tipo: filtro.credorTipo, status: filtro.status },
        schema: ContaPagarListaSaida,
        signal,
      }),
  })
}

/** Pessoas ativas da loja (candidatas a credor tipo pessoa). */
export function usePessoasCredor(habilitado: boolean) {
  return useQuery({
    queryKey: [RAIZ, 'pessoas-credor'],
    enabled: habilitado,
    queryFn: async ({ signal }) => {
      const r = await apiClient.get<PessoaLista>('/pessoas', { schema: PessoaListaSaida, signal })
      return r.itens.filter((p) => p.ativo).map<Credor>((p) => ({ id: p.id, nome: p.nome }))
    },
  })
}

/** POST /v1/contas-pagar/contas: lanca uma conta a pagar. */
export function useCriarConta() {
  const invalidar = useInvalidar()
  return useMutation<Conta, Error, ContaPagarNovo>({
    mutationFn: (body) => apiClient.post<Conta>('/contas-pagar/contas', { body, schema: ContaPagarSaida }),
    onSuccess: invalidar,
  })
}

/** PATCH /v1/contas-pagar/contas/:id: edita enquanto a_pagar (409 se paga). */
export function useAtualizarConta() {
  const invalidar = useInvalidar()
  return useMutation<Conta, Error, { id: string; patch: ContaPagarPatch }>({
    mutationFn: ({ id, patch }) =>
      apiClient.patch<Conta>(`/contas-pagar/contas/${id}`, { body: patch, schema: ContaPagarSaida }),
    onSuccess: invalidar,
  })
}

/** POST /v1/contas-pagar/contas/:id/pagar: confirma o valor visto (409 se divergiu). */
export function usePagarConta() {
  const invalidar = useInvalidar()
  return useMutation<Conta, Error, { id: string; valorCentavos: number }>({
    mutationFn: ({ id, valorCentavos }) =>
      apiClient.post<Conta>(`/contas-pagar/contas/${id}/pagar`, {
        body: { valor_centavos: valorCentavos },
        schema: ContaPagarSaida,
      }),
    onSuccess: invalidar,
  })
}
