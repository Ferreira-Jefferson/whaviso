// Sonda de ELEGIBILIDADE do usuario e sinal de "barrado", isolados em arquivo proprio (sem
// componentes) para os guards reusarem sem quebrar o fast-refresh, igual a sonda_operador.
import { useQuery } from '@tanstack/react-query'
import { useSessao } from '@/shared/auth'
import { apiClient } from '@/shared/api_client'

/** Estado de acesso do e-mail autenticado (espelha o contrato de GET /v1/acessos-login/eu). */
export type Elegibilidade = 'ativo' | 'pendente' | 'revogado' | 'nao_cadastrado'

/**
 * Pergunta ao backend "eu posso entrar?" (GET /acessos-login/eu): resolve o e-mail pelo proprio
 * token e devolve o estado na allowlist. `ativo` entra (mesmo sem loja: cria a loja depois);
 * `pendente` aguarda pagamento/aprovacao; `revogado`/`nao_cadastrado` nao entram. Erro transitorio
 * propaga para o guard tratar (nunca deslogar "na duvida"). `semLoja` evita enviar x-loja-id salvo.
 */
export function useMinhaElegibilidade() {
  const { status } = useSessao()
  return useQuery({
    queryKey: ['elegibilidade', 'eu'],
    enabled: status === 'logado',
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const r = await apiClient.get<{ estado: Elegibilidade }>('/acessos-login/eu', {
        semLoja: true,
        signal,
      })
      return r.estado
    },
  })
}

// Motivo pelo qual a pessoa foi barrada, passado do guard (que desloga) para a tela /entrar.
// `pendente` = cadastrado mas pagamento/aprovacao nao saiu; `negado` = nao cadastrado ou revogado.
export type MotivoBarrado = 'pendente' | 'negado'
const CHAVE_BARRADO = 'whaviso:acesso-barrado'

export function marcarBarrado(motivo: MotivoBarrado): void {
  try {
    sessionStorage.setItem(CHAVE_BARRADO, motivo)
  } catch {
    /* storage indisponivel: sem a mensagem, mas o bounce ainda acontece */
  }
}

/** Le e LIMPA o motivo (so vale para a proxima tela de /entrar). */
export function consumirBarrado(): MotivoBarrado | null {
  try {
    const v = sessionStorage.getItem(CHAVE_BARRADO)
    if (v === 'pendente' || v === 'negado') {
      sessionStorage.removeItem(CHAVE_BARRADO)
      return v
    }
  } catch {
    /* storage indisponivel */
  }
  return null
}
