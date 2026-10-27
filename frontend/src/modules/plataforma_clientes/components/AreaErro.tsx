// Erro de uma area do console. 403 = o usuario logado nao e operador (ou nao e admin, na equipe).
import { ApiError } from '@/shared/api_client'
import { ErrorState } from '@/shared/ui'

export function AreaErro({
  erro,
  aoTentarDeNovo,
  exigeAdmin = false,
}: {
  erro: unknown
  aoTentarDeNovo: () => void
  exigeAdmin?: boolean
}) {
  if (erro instanceof ApiError && erro.isForbidden) {
    return (
      <ErrorState
        titulo={exigeAdmin ? 'Só administradores' : 'Acesso restrito à equipe Whaviso'}
        descricao={
          exigeAdmin
            ? 'A gestão da equipe é restrita a administradores da plataforma.'
            : 'Este console é só para operadores da plataforma. Sua conta não tem esse acesso.'
        }
      />
    )
  }
  return <ErrorState aoTentarDeNovo={aoTentarDeNovo} />
}
