// Maquina de transicoes do handoff manual (pura, sem I/O; testavel isolada).
// 'encerrada' e terminal (nunca transiciona). O guard de PROPRIEDADE (quem pode devolver)
// nao vive aqui: e decidido no servico, que conhece o membro/papel da requisicao.
import type { StatusConversa } from '@whaviso/shared/contracts'

export type AcaoHandoff = 'assumir' | 'devolver'

/** Estado relevante da conversa para decidir a transicao. */
export interface EstadoHandoff {
  status: StatusConversa
  /** atendido_por_membro_id nao nulo: um humano ja segura a conversa. */
  temDono: boolean
}

// Estados a partir dos quais 'assumir' leva direto a 'humano': a IA conduz ('ia') ou pediu
// ajuda ('aguardando'). Alem destes, 'humano' SEM dono tambem e reivindicavel (a IA de hoje
// escreve status='humano' com membro nulo ao pedir humano).
const ASSUMIVEL_DIRETO: ReadonlySet<StatusConversa> = new Set<StatusConversa>(['ia', 'aguardando'])

/** Status resultante da acao a partir de `e`, ou null se a transicao nao e permitida. */
export function proximoStatus(acao: AcaoHandoff, e: EstadoHandoff): StatusConversa | null {
  if (acao === 'assumir') {
    if (ASSUMIVEL_DIRETO.has(e.status)) return 'humano'
    if (e.status === 'humano' && !e.temDono) return 'humano'
    return null
  }
  // devolver: humano -> ia (limpa quem atendia).
  return e.status === 'humano' ? 'ia' : null
}
