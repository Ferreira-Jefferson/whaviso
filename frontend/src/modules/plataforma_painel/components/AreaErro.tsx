// Erro de uma area do console. 403 = o usuario logado nao e operador ativo da plataforma.
import { ApiError } from '@/shared/api_client'
import { ErrorState } from '@/shared/ui'

export function AreaErro({ erro, aoTentarDeNovo }: { erro: unknown; aoTentarDeNovo: () => void }) {
  if (erro instanceof ApiError && erro.isForbidden) {
    return (
      <ErrorState
        titulo="Acesso restrito à equipe Whaviso"
        descricao="Este console é só para operadores da plataforma. Sua conta não tem esse acesso."
      />
    )
  }
  return <ErrorState aoTentarDeNovo={aoTentarDeNovo} />
}
