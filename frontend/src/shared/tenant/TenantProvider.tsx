// TenantProvider: carrega as lojas do usuario (GET /v1/lojas), guarda a loja ativa, aplica o
// branding e a envia no header `x-loja-id` (via api_client/loja_ativa). Trocar de loja limpa
// o cache de queries (nada de dado de uma loja pode aparecer na outra, SEC-001).
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, definirLojaAtiva } from '../api_client'
import { useSessao } from '../auth'
import { aplicarBranding, calcularBranding } from './branding'
import { ListaLojas, type LojaResumo } from './contratos'
import { lerLojaSalva, salvarLoja } from './armazenamento'
import { TenantContext, type TenantState } from './context'

export const CHAVE_LOJAS = ['lojas'] as const

export function TenantProvider({ children }: { children: ReactNode }) {
  const { status, userId } = useSessao()
  const qc = useQueryClient()
  const [escolhida, setEscolhida] = useState<string | null>(null)

  const consulta = useQuery({
    queryKey: CHAVE_LOJAS,
    enabled: status === 'logado',
    // Rota fora do escopo de loja: ainda nao ha loja ativa para enviar.
    queryFn: ({ signal }) => apiClient.get<LojaResumo[]>('/lojas', { schema: ListaLojas, semLoja: true, signal }),
  })

  const lojas = useMemo(() => consulta.data ?? [], [consulta.data])

  // Loja ativa derivada: a escolhida se ainda existe; senao a salva do usuario; senao a primeira.
  const lojaAtiva = useMemo<LojaResumo | null>(() => {
    if (lojas.length === 0) return null
    const salva = userId ? lerLojaSalva(userId) : null
    return (
      lojas.find((l) => l.id === escolhida) ?? lojas.find((l) => l.id === salva) ?? lojas[0] ?? null
    )
  }, [lojas, escolhida, userId])

  const lojaAtivaId = lojaAtiva?.id ?? null
  // Sincroniza ANTES dos filhos consultarem: o header precisa estar certo na 1a requisicao.
  definirLojaAtiva(lojaAtivaId)

  useEffect(() => {
    aplicarBranding(calcularBranding(lojaAtiva?.cores))
    return () => aplicarBranding(null)
  }, [lojaAtiva])

  // Sem sessao: esquece a escolha e limpa o escopo.
  useEffect(() => {
    if (status === 'deslogado') {
      setEscolhida(null)
      definirLojaAtiva(null)
    }
  }, [status])

  const selecionarLoja = useCallback(
    (id: string) => {
      if (!lojas.some((l) => l.id === id) || id === lojaAtivaId) return
      definirLojaAtiva(id)
      if (userId) salvarLoja(userId, id)
      // reset (nao so remove): zera o dado da loja anterior E refaz as queries ativas ja com o
      // novo header; resposta em voo da loja antiga e cancelada.
      void qc.resetQueries({ predicate: (q) => q.queryKey[0] !== CHAVE_LOJAS[0] })
      setEscolhida(id)
    },
    [lojas, lojaAtivaId, userId, qc],
  )

  const value = useMemo<TenantState>(
    () => ({
      lojas,
      lojaAtiva,
      status: consulta.isPending ? 'carregando' : consulta.isError ? 'erro' : 'ok',
      erro: consulta.error,
      selecionarLoja,
      recarregar: () => void consulta.refetch(),
    }),
    [lojas, lojaAtiva, consulta, selecionarLoja],
  )

  return <TenantContext value={value}>{children}</TenantContext>
}
