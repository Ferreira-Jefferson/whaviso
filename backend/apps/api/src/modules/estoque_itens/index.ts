export { estoqueItensRoutes } from './routes'
// Funcao pura reutilizavel pelo fluxo de pedido (venda) para decrementar o estoque do item.
export { decrementarPorVenda, type ResultadoVenda } from './venda'
