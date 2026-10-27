// Erro de uma area. 403 = quem esta logado nao e operador (console) ou nao e dono (fatura da loja).
import { ApiError } from '@/shared/api_client'
import { ErrorState } from '@/shared/ui'

export function AreaErro({
  erro,
  aoTentarDeNovo,
  deDono = false,
}: {
  erro: unknown
  aoTentarDeNovo: () => void
  deDono?: boolean
}) {
  if (erro instanceof ApiError && erro.isForbidden) {
    return (
      <ErrorState
        titulo={deDono ? 'Só o dono da conta vê as faturas' : 'Acesso restrito à equipe Whaviso'}
        descricao={
          deDono
            ? 'Peça ao dono da conta para acompanhar a cobrança da Whaviso.'
            : 'Este console é só para operadores da plataforma. Sua conta não tem esse acesso.'
        }
      />
    )
  }
  return <ErrorState aoTentarDeNovo={aoTentarDeNovo} />
}
