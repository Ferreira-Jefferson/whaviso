// Grafo FIXO do pedido (dados, nao logica espalhada). Declara os nodes e as transicoes possiveis
// de cada um. O proximo node de um turno vem do SaidaNode.proximo do node que rodou; este grafo e
// a fonte unica para validar o registry e documentar o fluxo. Quando o builder visual (onda 5)
// chegar, ele troca a FONTE deste grafo (arquivo -> banco) sem mexer no motor.
//
//   saudacao -> pedir_categoria -> montar_pedido -> confirmar -> endereco -> pagamento ->
//   acompanhar. `null` em `proximos` = fim do turno (encerrar/handoff). Lacos (montar_pedido,
//   confirmar, endereco) cobrem "adicionar mais", reapresentacao e sub-passos de texto.

export const GRAFO = {
  versao: 1,
  inicial: 'saudacao',
  nodes: {
    saudacao: { proximos: ['pedir_categoria', null] },
    pedir_categoria: { proximos: ['montar_pedido', 'pedir_categoria', null] },
    montar_pedido: { proximos: ['montar_pedido', 'confirmar', null] },
    confirmar: { proximos: ['endereco', 'pedir_categoria', null] },
    endereco: { proximos: ['pagamento', 'endereco', null] },
    pagamento: { proximos: ['acompanhar', 'pagamento', null] },
    acompanhar: { proximos: ['acompanhar'] },
  },
} as const

export type TipoNode = keyof typeof GRAFO.nodes
export const TIPOS_NODE = Object.keys(GRAFO.nodes) as TipoNode[]
