// Kernel `shared` da CARTEIRA de créditos (Épico 11): lê GET /v1/billing/carteira e expõe
// o saldo + a curva do catálogo. Consumido por `painel`/`avisos` SEM que os módulos
// importem `billing` (fronteira do lint). A AUTORIDADE da restrição é a API (ativar sem
// saldo retorna envelope de erro `saldo_insuficiente`); o front só antecipa (esconde/CTA).
// NUNCA recalculamos saldo no cliente: os números vêm do backend.
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api_client'
import { carteiraResposta, type CarteiraResposta } from '../contracts'

export const planoKeys = {
  carteira: ['billing', 'carteira'] as const,
}

/** GET /v1/billing/carteira: saldo da carteira + curva do catálogo (para o slider). */
export function useCarteira() {
  return useQuery({
    queryKey: planoKeys.carteira,
    queryFn: ({ signal }) =>
      apiClient.get<CarteiraResposta>('/billing/carteira', {
        schema: carteiraResposta,
        signal,
      }),
  })
}

/**
 * `semSaldo` = a conta não tem crédito livre para ativar um novo envio: ações de ENVIAR
 * levam à CTA de comprar créditos, sem quebrar a navegação. Enquanto carrega, assume
 * `false` (não bloqueia a UI à toa; a API barra de fato se faltar saldo). Espelho do
 * backend (saldo_livre), nunca inferido no cliente.
 */
export function useSemSaldo(): { semSaldo: boolean; saldoLivre: number; isLoading: boolean } {
  const q = useCarteira()
  const saldoLivre = q.data?.carteira.saldo_livre ?? 0
  return { semSaldo: q.data !== undefined && saldoLivre <= 0, saldoLivre, isLoading: q.isLoading }
}
