// Apresentacao do salao: deriva o estado visivel de uma mesa e seus rotulos.
// A verdade e do servidor (MesaSaida.comanda_aberta_id / .ativo); aqui so traduzimos
// para rotulo e tom de badge. Nada de regra de negocio decidida no cliente.
import type { MesaSaida } from '@/shared/contracts/_generated/salao'

export type EstadoMesa = 'livre' | 'ocupada' | 'inativa'

/** Mesa ocupada = tem comanda aberta; inativa = cadastro desligado; senao livre. */
export function estadoDaMesa(mesa: MesaSaida): EstadoMesa {
  if (!mesa.ativo) return 'inativa'
  return mesa.comanda_aberta_id != null ? 'ocupada' : 'livre'
}

export const ROTULO_ESTADO: Record<EstadoMesa, string> = {
  livre: 'Livre',
  ocupada: 'Ocupada',
  inativa: 'Inativa',
}

export const TOM_ESTADO: Record<EstadoMesa, 'sucesso' | 'atencao' | 'neutro'> = {
  livre: 'sucesso',
  ocupada: 'atencao',
  inativa: 'neutro',
}

/** Cor da faixa lateral do cartao: deixa o mapa de mesas legivel num relance (livre
 *  em verde-folha, ocupada em ambar, inativa apagada). Faixa so com borda esquerda
 *  para nao brigar com a cor das demais bordas. */
export const ACENTO_ESTADO: Record<EstadoMesa, string> = {
  livre: 'border-l-folha',
  ocupada: 'border-l-ambar',
  inativa: 'border-l-linha',
}

/** "4 lugares" / "" (quando a capacidade nao foi informada). */
export function rotuloCapacidade(capacidade: number | null): string {
  if (capacidade == null) return ''
  return capacidade === 1 ? '1 lugar' : `${capacidade} lugares`
}
