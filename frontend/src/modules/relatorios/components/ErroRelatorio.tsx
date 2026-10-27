// Erro de relatorio: 403 vira orientacao (so dono e gerente), o resto oferece nova tentativa.
import { ErrorState } from '@/shared/ui'
import { ApiError } from '@/shared/api_client'

export function ErroRelatorio({ erro, aoTentarDeNovo }: { erro: unknown; aoTentarDeNovo: () => void }) {
  if (erro instanceof ApiError && erro.isForbidden) {
    return (
      <ErrorState
        titulo="Relatórios restritos"
        descricao="Estes relatórios são para o dono e o gerente da loja. Peça acesso a quem administra a conta."
      />
    )
  }
  return <ErrorState aoTentarDeNovo={aoTentarDeNovo} />
}
