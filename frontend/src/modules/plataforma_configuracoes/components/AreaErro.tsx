// Erro de uma area. 403 = quem esta logado nao tem a permissao de admin (chaves_api:gerir).
import { ApiError } from '@/shared/api_client'
import { ErrorState } from '@/shared/ui'

export function AreaErro({ erro, aoTentarDeNovo }: { erro: unknown; aoTentarDeNovo: () => void }) {
  if (erro instanceof ApiError && erro.isForbidden) {
    return (
      <ErrorState
        titulo="Acesso restrito"
        descricao="Essa configuração é só para quem administra credenciais da plataforma."
      />
    )
  }
  return <ErrorState aoTentarDeNovo={aoTentarDeNovo} />
}
