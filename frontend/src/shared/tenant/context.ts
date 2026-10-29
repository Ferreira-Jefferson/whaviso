import { createContext, useContext } from 'react'
import type { LojaResumo } from './contratos'

export interface TenantState {
  lojas: LojaResumo[]
  /** Loja ativa (null enquanto carrega ou quando o usuario nao tem loja). */
  lojaAtiva: LojaResumo | null
  status: 'carregando' | 'erro' | 'ok'
  /** Enquanto /lojas carrega: ha loja salva semeando o x-loja-id, entao a pagina pode montar ja. */
  lojaSemeada?: boolean
  erro: Error | null
  /** Troca a loja ativa e limpa o cache de queries (exceto a lista de lojas). */
  selecionarLoja: (id: string) => void
  recarregar: () => void
}

export const TenantContext = createContext<TenantState | null>(null)

export function useTenant(): TenantState {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant deve ser usado dentro de <TenantProvider>.')
  return ctx
}

/** Loja ativa; null se ainda nao ha. */
export function useLojaAtiva(): LojaResumo | null {
  return useTenant().lojaAtiva
}
