// Calculo PURO de promocao (sem banco, sem relogio, sem I/O): recebe a regra, o contexto do pedido
// e o `agora` injetado. Dinheiro em centavos inteiros; arredondamento sempre para BAIXO (favorece a
// loja). O desconto incide so no SUBTOTAL (a taxa de entrega nunca entra) e nunca passa dele.
// A janela de validade e comparada em instantes absolutos (UTC); a conversao para
// America/Sao_Paulo e feita na borda, onde o cliente envia/le datas com offset.

export type TipoPromocao = 'cupom_percentual' | 'cupom_fixo' | 'combo'

export type MotivoRecusa =
  | 'cupom_inexistente' | 'cupom_inativo' | 'cupom_nao_iniciado' | 'cupom_expirado'
  | 'cupom_esgotado' | 'cupom_cliente_esgotado' | 'pedido_abaixo_minimo' | 'combo_incompleto'

export interface RegraPromocao {
  tipo: TipoPromocao
  valor: number
  ativo: boolean
  inicio_em: string | null
  fim_em: string | null
  limite_total: number | null
  limite_por_cliente: number | null
  min_pedido_centavos: number
  desconto_maximo_centavos: number | null
  itens: { item_id: string; quantidade: number }[]
}

export interface LinhaPedido {
  item_id: string
  quantidade: number
  preco_unitario_centavos: number
}

export interface ContextoPedido {
  agora: Date
  subtotal_centavos: number
  linhas?: LinhaPedido[]
  /** Usos ja registrados da promocao na loja. */
  usos_total: number
  /** Usos do cliente do pedido (0 quando o pedido nao tem cliente identificado). */
  usos_cliente: number
  /** Houve cliente identificado? Sem cliente, o limite por cliente nao pode ser aferido e nao bloqueia. */
  tem_cliente: boolean
}

export type ResultadoPromocao =
  | { valido: true; desconto_centavos: number }
  | { valido: false; motivo: MotivoRecusa }

/** Desconto do combo: (valor normal dos conjuntos completos) - (preco do combo x conjuntos). */
function descontoCombo(regra: RegraPromocao, linhas: LinhaPedido[]): number | null {
  if (regra.itens.length === 0) return null
  const porItem = new Map<string, { qtd: number; total: number }>()
  for (const l of linhas) {
    const a = porItem.get(l.item_id) ?? { qtd: 0, total: 0 }
    a.qtd += l.quantidade
    a.total += l.quantidade * l.preco_unitario_centavos
    porItem.set(l.item_id, a)
  }
  let conjuntos = Infinity
  for (const c of regra.itens) {
    const a = porItem.get(c.item_id)
    conjuntos = Math.min(conjuntos, a ? Math.floor(a.qtd / c.quantidade) : 0)
  }
  if (!Number.isFinite(conjuntos) || conjuntos < 1) return null
  let normal = 0
  for (const c of regra.itens) {
    const a = porItem.get(c.item_id)!
    normal += Math.floor((a.total / a.qtd) * c.quantidade) * conjuntos
  }
  return Math.max(0, normal - regra.valor * conjuntos)
}

export function calcularPromocao(regra: RegraPromocao, ctx: ContextoPedido): ResultadoPromocao {
  const recusa = (motivo: MotivoRecusa): ResultadoPromocao => ({ valido: false, motivo })
  if (!regra.ativo) return recusa('cupom_inativo')
  const t = ctx.agora.getTime()
  if (regra.inicio_em && t < Date.parse(regra.inicio_em)) return recusa('cupom_nao_iniciado')
  if (regra.fim_em && t >= Date.parse(regra.fim_em)) return recusa('cupom_expirado')
  if (regra.limite_total !== null && ctx.usos_total >= regra.limite_total) return recusa('cupom_esgotado')
  if (ctx.tem_cliente && regra.limite_por_cliente !== null && ctx.usos_cliente >= regra.limite_por_cliente) {
    return recusa('cupom_cliente_esgotado')
  }
  if (ctx.subtotal_centavos < regra.min_pedido_centavos) return recusa('pedido_abaixo_minimo')

  let bruto: number
  if (regra.tipo === 'cupom_percentual') {
    bruto = Math.floor((ctx.subtotal_centavos * regra.valor) / 100)
  } else if (regra.tipo === 'cupom_fixo') {
    bruto = regra.valor
  } else {
    const d = descontoCombo(regra, ctx.linhas ?? [])
    if (d === null) return recusa('combo_incompleto')
    bruto = d
  }
  if (regra.desconto_maximo_centavos !== null) bruto = Math.min(bruto, regra.desconto_maximo_centavos)
  return { valido: true, desconto_centavos: Math.max(0, Math.min(bruto, ctx.subtotal_centavos)) }
}

/** Atalho: subtotal apos o desconto (nunca negativo). */
export function aplicarDesconto(subtotalCentavos: number, descontoCentavos: number): number {
  return Math.max(0, subtotalCentavos - descontoCentavos)
}
