import { processarBotao, processarTexto, type DepsInbound } from './service'

/**
 * Liga o inbound do WhatsApp: o Baileys entrega cliques de botão E mensagens de texto
 * pelos eventos do socket (não há mais webhook HTTP da Meta). Botões = ações do convite/
 * devedor; texto = a 1ª mensagem do convite (número de 6 dígitos) e o fallback numerado
 * (E5). Chamado pelo server.ts (app-root), que pode cruzar a fronteira para os módulos; o
 * módulo não importa outro módulo.
 */
export function registrarInboundWhats(deps: DepsInbound): void {
  deps.whats.onBotao((evento) => processarBotao(deps, evento))
  deps.whats.onTexto((evento) => processarTexto(deps, evento))
}

export type { DepsInbound }
