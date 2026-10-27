// Estimativa de pronto (funcao pura). O cardapio nao guarda tempo de preparo por item e nao ha
// timestamp de entrada em `em_preparo`, entao a base do relogio e `pedidos.criado_em` e o preparo vem
// da configuracao da loja: base + itens * preparo_por_item.
export interface ParamsPreparo {
  preparoBaseMin: number
  preparoPorItemMin: number
}

export function prontoPrevistoEm(criadoEm: Date, itens: number, p: ParamsPreparo): Date {
  const min = p.preparoBaseMin + Math.max(0, itens) * p.preparoPorItemMin
  return new Date(criadoEm.getTime() + Math.round(min * 60_000))
}
