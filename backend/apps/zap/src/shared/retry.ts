// Política de retry compartilhada das outboxes do zap (notificacoes_cobrador e
// envios). H6.8/H10.1: EXATAMENTE 3 tentativas de envio, com intervalo ALEATÓRIO
// entre 20 e 60s entre elas (nunca 4 tentativas, nunca backoff em minutos).
//
// Antes cada repo tinha seu BACKOFF_MIN=[5,15,45] (minutos). Centralizado aqui para
// os dois alinharem e não divergirem de novo.
//
// Não confundir com o rate-limit da própria Meta Cloud API (que espaça/limita os
// envios no lado dela); este retry é a repetição de UMA mensagem que falhou
// transitoriamente.

/** Número máximo de TENTATIVAS de envio (a 1a + 2 reagendamentos). */
export const MAX_TENTATIVAS = 3

const RETRY_MIN_SEG = 20
const RETRY_MAX_SEG = 60

/**
 * Intervalo (em segundos) até a próxima tentativa: aleatório uniforme em [20, 60].
 * Inteiro para caber direto no `interval` do Postgres.
 */
export function intervaloRetrySegundos(): number {
  return RETRY_MIN_SEG + Math.floor(Math.random() * (RETRY_MAX_SEG - RETRY_MIN_SEG + 1))
}

/**
 * Dado o número de tentativas JÁ feitas, decide se ainda reagenda (e por quantos
 * segundos) ou se a entrega falhou de vez. `tentativasAtuais` é o contador ANTES
 * desta falha; a próxima será `tentativasAtuais + 1`.
 */
export function decidirReagendamento(
  tentativasAtuais: number,
): { acao: 'falhou' } | { acao: 'reagendar'; proxima: number; segundos: number } {
  const proxima = tentativasAtuais + 1
  if (proxima >= MAX_TENTATIVAS) return { acao: 'falhou' }
  return { acao: 'reagendar', proxima, segundos: intervaloRetrySegundos() }
}
