import { processarBotao, processarStatus, processarTexto, type DepsInbound } from './service'

// E14: expiração das sessões de wizard de chave (abandono). Re-exportada para o
// app-root (scheduler) chamar pela fronteira do módulo (não por arquivo interno).
export { expirarSessoesPix } from './wizard_pix'

/**
 * Liga o inbound do WhatsApp: o transporte (Meta Cloud API) entrega, pelo webhook HTTP,
 * cliques de botão, mensagens de texto e recibos de entrega (status). Botões = ações do
 * convite/devedor; texto = a 1ª mensagem do convite (número de 6 dígitos) e o fallback
 * numerado (E5); status = sent/delivered/read/failed -> envios.entrega_status. Chamado
 * pelo server.ts (app-root), que pode cruzar a fronteira para os módulos; o módulo não
 * importa outro módulo.
 */
export function registrarInboundWhats(deps: DepsInbound): void {
  deps.whats.onBotao((evento) => processarBotao(deps, evento))
  deps.whats.onTexto((evento) => processarTexto(deps, evento))
  deps.whats.onStatus((evento) => processarStatus(deps, evento))
}

export type { DepsInbound }
