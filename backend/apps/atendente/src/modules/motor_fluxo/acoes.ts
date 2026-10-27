// Construtores PUROS de mensagens e efeitos propostos (dados, nunca comandos executados aqui).
// Os nodes usam estes helpers para montar o SaidaNode; o motor (service) e quem efetiva.
import type { EfeitoProposto, MensagemProposta, SaidaNode } from '@whaviso/shared/contracts'
import type { EstadoFluxo } from './tipos'

/** Tipos de efeito que o motor sabe efetivar. Chave estavel; `dados` validado no effetivador. */
export const EFEITO = {
  estado: 'estado',
  criarEndereco: 'criar_endereco',
  criarPedido: 'criar_pedido',
  handoff: 'handoff',
  encerrar: 'encerrar',
} as const

export function texto(t: string): MensagemProposta {
  return { tipo: 'texto', texto: t }
}

/** Mensagem interativa (ate 3 botoes). Rotulo cortado em 20 chars (limite do contrato/Meta). */
export function botoes(t: string, botoes: { id: string; rotulo: string }[]): MensagemProposta {
  return {
    tipo: 'interativo',
    texto: t,
    botoes: botoes.slice(0, 3).map((b) => ({ id: b.id, rotulo: b.rotulo.slice(0, 20) })),
  }
}

/** Efeito: persistir o proximo estado do fluxo (o motor escreve conversas.contexto). */
export function efeitoEstado(estado: EstadoFluxo): EfeitoProposto {
  return { tipo: EFEITO.estado, dados: { estado } }
}

/** Efeito: criar um endereco novo a partir do texto informado (o motor insere e seta endereco_id). */
export function efeitoCriarEndereco(logradouro: string): EfeitoProposto {
  return { tipo: EFEITO.criarEndereco, dados: { logradouro } }
}

export function efeitoCriarPedido(): EfeitoProposto {
  return { tipo: EFEITO.criarPedido, dados: {} }
}

export function efeitoHandoff(): EfeitoProposto {
  return { tipo: EFEITO.handoff, dados: {} }
}

export function efeitoEncerrar(): EfeitoProposto {
  return { tipo: EFEITO.encerrar, dados: {} }
}

/** Monta um SaidaNode (proximo + mensagens + efeitos) com defaults. */
export function saida(
  proximo: string | null,
  mensagens: MensagemProposta[],
  efeitos: EfeitoProposto[] = [],
): SaidaNode {
  return { proximo, mensagens, efeitos }
}
