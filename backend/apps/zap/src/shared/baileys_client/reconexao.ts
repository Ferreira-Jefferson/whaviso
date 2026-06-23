// Estratégia de reconexão: backoff exponencial com teto + jitter e classificação
// do motivo da desconexão (mapeia DisconnectReason do Baileys).

const BASE_MS = 1_000
const TETO_MS = 30_000

export interface EstadoBackoff {
  tentativas: number
}

/** Calcula a espera da próxima reconexão e incrementa o contador. */
export function calcularBackoff(estado: EstadoBackoff, piso = 0): number {
  estado.tentativas += 1
  const exp = Math.min(BASE_MS * 2 ** (estado.tentativas - 1), TETO_MS)
  const jitter = Math.floor(Math.random() * 1000) // evita reconexões sincronizadas
  return Math.max(exp, piso) + jitter
}

export type AcaoDesconexao =
  | 'limpar_sessao' // sessão inválida/corrompida → apaga e recomeça (novo QR)
  | 'reconectar_ja' // esperado logo após parear (515)
  | 'reconectar_espera' // outra conexão assumiu (440), espera maior
  | 'reconectar_backoff' // queda comum → backoff

export function classificarDesconexao(
  code: number | undefined,
  reasons: Record<string, number>,
): AcaoDesconexao {
  if (code === reasons.loggedOut || code === reasons.badSession) return 'limpar_sessao'
  if (code === reasons.restartRequired) return 'reconectar_ja'
  if (code === reasons.connectionReplaced) return 'reconectar_espera'
  return 'reconectar_backoff'
}
