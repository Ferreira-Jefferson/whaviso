// Banner discreto de status da assinatura do usuário (polish da Fase 7).
// Mostra-se só para `user` (não owner) e só quando a api indica que a assinatura precisa
// de atenção. O backend (billing/assinatura) expõe status 'trial'|'ativa'|
// 'cancelada'. NÃO há conceito de pagamento vencido/pendente no MVP (stub sem
// gateway). Tratamos 'cancelada' como "precisa de atenção". Linguagem das Regras
// de Ouro: é sobre a assinatura DELE no whaviso, frase neutra, nunca termos de
// pagamento agressivo.
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import { assinaturaSchema, type Assinatura } from '@/shared/contracts'
import { useRole } from '@/shared/auth'

export function AssinaturaBanner() {
  const role = useRole()
  const habilitado = role === 'user'

  const { data } = useQuery({
    queryKey: ['billing', 'assinatura'],
    enabled: habilitado,
    staleTime: 60_000,
    retry: 0,
    queryFn: ({ signal }) =>
      apiClient.get<Assinatura>('/billing/assinatura', {
        schema: assinaturaSchema,
        signal,
      }),
  })

  if (!habilitado || data?.status !== 'cancelada') return null

  return (
    <div
      role="status"
      className="border-b border-ambar/30 bg-ambar-claro px-4 py-2 text-center text-sm text-barro"
    >
      Sua assinatura precisa de atenção.{' '}
      <Link to="/app/plano" className="font-medium underline">
        Ver meu plano
      </Link>
    </div>
  )
}
