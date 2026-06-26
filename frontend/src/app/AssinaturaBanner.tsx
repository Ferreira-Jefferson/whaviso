// Banner discreto de SALDO BAIXO/ZERO da carteira do usuário (Épico 11, H11.8/H11.9):
// alerta a pessoa antes de esbarrar no limite ao ativar. Mostra-se só para `user` (não
// owner) e só quando o saldo livre está baixo (<= 3) ou zerado. Linguagem das Regras de
// Ouro: crédito, envio, saldo, recarga (nunca termos de pagamento agressivo).
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import { carteiraResposta, type CarteiraResposta } from '@/shared/contracts'
import { useRole } from '@/shared/auth'

const LIMITE_BAIXO = 3

export function AssinaturaBanner() {
  const role = useRole()
  const habilitado = role === 'user'

  const { data } = useQuery({
    queryKey: ['billing', 'carteira'],
    enabled: habilitado,
    staleTime: 60_000,
    retry: 0,
    queryFn: ({ signal }) =>
      apiClient.get<CarteiraResposta>('/billing/carteira', {
        schema: carteiraResposta,
        signal,
      }),
  })

  const saldo = data?.carteira.saldo_livre
  if (!habilitado || saldo === undefined || saldo > LIMITE_BAIXO) return null

  return (
    <div
      role="status"
      className="border-b border-ambar/30 bg-ambar-claro px-4 py-2 text-center text-sm text-barro"
    >
      {saldo === 0
        ? 'Você está sem saldo de envios. '
        : `Seu saldo está baixo (${saldo} ${saldo === 1 ? 'envio' : 'envios'}). `}
      <Link to="/app/creditos" className="font-medium underline">
        Recarregar créditos
      </Link>
    </div>
  )
}
