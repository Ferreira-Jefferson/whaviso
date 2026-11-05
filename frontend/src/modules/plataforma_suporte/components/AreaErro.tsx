// Erro de uma area do console de suporte. 403 = o usuario logado nao tem a permissao de suporte da
// plataforma (nao e operador, ou nao tem `suporte_plataforma:ver`/`:atender`). Primitivo LOCAL
// (modulo nunca importa modulo).
import { ApiError } from '@/shared/api_client'
import { ErrorState } from '@/shared/ui'

export function AreaErro({ erro, aoTentarDeNovo }: { erro: unknown; aoTentarDeNovo?: () => void }) {
  if (erro instanceof ApiError && erro.isForbidden) {
    return (
      <ErrorState
        titulo="Acesso restrito à equipe Whaviso"
        descricao="O suporte pela plataforma é restrito a operadores com a permissão de suporte. Sua conta não tem esse acesso."
      />
    )
  }
  return <ErrorState aoTentarDeNovo={aoTentarDeNovo} />
}
