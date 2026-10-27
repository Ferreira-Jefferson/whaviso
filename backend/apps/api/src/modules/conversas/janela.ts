// Janela de 24h da Meta (regra do servidor; o cliente nunca calcula).
// janelaAbertaAte = ultima_entrada_em + 24h; aberta se agora < janelaAbertaAte.
// Sem entrada registrada = fechada. Funcoes puras: o relogio entra por parametro.
export const JANELA_MS = 24 * 60 * 60 * 1000

export interface EstadoJanela {
  janela_aberta: boolean
  janela_aberta_ate: string | null
  janela_restante_segundos: number
}

export function janela24h(ultimaEntradaEm: Date | null, agora: Date): EstadoJanela {
  if (!ultimaEntradaEm) {
    return { janela_aberta: false, janela_aberta_ate: null, janela_restante_segundos: 0 }
  }
  const ate = ultimaEntradaEm.getTime() + JANELA_MS
  const restanteMs = ate - agora.getTime()
  return {
    janela_aberta: restanteMs > 0,
    janela_aberta_ate: new Date(ate).toISOString(),
    janela_restante_segundos: restanteMs > 0 ? Math.floor(restanteMs / 1000) : 0,
  }
}
