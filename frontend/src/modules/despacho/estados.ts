// Apresentacao do despacho: rotulos de veiculo e de status do pedido/corrida, e o estado de
// exibicao da corrida. Nada de regra de negocio: o que pode ou nao acontecer e decidido pela api
// (409/422 voltam como mensagem); aqui so se escolhe quais botoes mostrar.
import type { StatusPedido, TipoVeiculo } from '@/shared/contracts/_generated/enums'
import type { CorridaSaida } from '@/shared/contracts/_generated/despacho'

export const ROTULO_VEICULO: Record<TipoVeiculo, string> = {
  moto: 'Moto',
  bicicleta: 'Bicicleta',
  carro: 'Carro',
  a_pe: 'A pé',
}

export const ROTULO_STATUS_PEDIDO: Record<StatusPedido, string> = {
  rascunho: 'Rascunho',
  novo: 'Novo',
  em_preparo: 'Em preparo',
  saiu_entrega: 'Saiu para entrega',
  entregue: 'Entregue',
  problema: 'Com problema',
}

export type EstadoCorrida = 'montando' | 'despachada' | 'concluida' | 'cancelada'

/** Corrida cancelada e `concluida` + `cancelada: true` no contrato (sem valor novo de enum). */
export function estadoDaCorrida(c: Pick<CorridaSaida, 'status' | 'cancelada'>): EstadoCorrida {
  return c.cancelada ? 'cancelada' : c.status
}

export const ROTULO_ESTADO_CORRIDA: Record<EstadoCorrida, string> = {
  montando: 'Montando',
  despachada: 'Em rota',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
}
