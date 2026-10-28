// Node `acompanhar`: responde "cade meu pedido" lendo o status REAL do pedido (vivo, carregado
// pelo motor a cada turno; nunca cache). Nao cria efeito: so informa. Mantem a etapa (o cliente
// pode perguntar de novo). SEM LLM.
import type { NodeContract } from '@whaviso/shared/contracts'
import { saida, texto } from '../acoes'
import { ConfigVazia, type EntradaTurno } from '../tipos'

const MENSAGEM: Record<string, string> = {
  novo: 'Recebemos seu pedido e ele esta na fila de preparo.',
  em_preparo: 'Seu pedido esta em preparo. Falta pouco.',
  saiu_entrega: 'Seu pedido saiu para entrega e logo chega ate voce.',
  entregue: 'Seu pedido consta como entregue. Bom apetite!',
  problema: 'Tivemos um imprevisto com seu pedido. Ja estamos resolvendo e falamos por aqui.',
}

export const acompanharNode: NodeContract<ConfigVazia, EntradaTurno> = {
  tipo: 'acompanhar',
  usaLlm: false,
  configSchema: ConfigVazia,
  async executar(entrada) {
    const { estado, pedidoStatus, loja } = entrada
    const codigo = estado.codigo ? ` (${estado.codigo})` : ''
    // Pedido ainda `novo` no modo agendamento: deixa claro que e agendado (entra no preparo dentro
    // do horario de atendimento), nunca promete entrega imediata. Status reais (em preparo, saiu
    // para entrega) refletem a operacao de verdade e seguem como estao.
    const base = pedidoStatus
      ? pedidoStatus === 'novo' && loja.modo === 'agendamento'
        ? 'Recebemos seu pedido agendado. Ele entra no preparo dentro do horario de atendimento.'
        : (MENSAGEM[pedidoStatus] ?? 'Seu pedido esta em andamento.')
      : 'Nao encontrei um pedido em andamento. Quando quiser pedir, e so chamar.'
    return saida('acompanhar', [texto(`${base}${pedidoStatus ? codigo : ''}`)], [])
  },
}
