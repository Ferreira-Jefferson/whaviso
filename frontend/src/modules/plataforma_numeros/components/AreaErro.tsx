// Erro de uma area do console. 403 = o usuario logado nao tem a permissao de numeros da plataforma
// (nao e operador, ou nao tem `numeros_plataforma:ver`/`:gerir`). Primitivo LOCAL (replica o do
// modulo plataforma_usuarios; modulo nunca importa modulo).
import { ApiError } from '@/shared/api_client'
import { ErrorState } from '@/shared/ui'

export function AreaErro({
  erro,
  aoTentarDeNovo,
}: {
  erro: unknown
  aoTentarDeNovo?: () => void
}) {
  if (erro instanceof ApiError && erro.isForbidden) {
    return (
      <ErrorState
        titulo="Acesso restrito à equipe Whaviso"
        descricao="A gestão de números pela plataforma é restrita a operadores com a permissão de números. Sua conta não tem esse acesso."
      />
    )
  }
  return <ErrorState aoTentarDeNovo={aoTentarDeNovo} />
}
