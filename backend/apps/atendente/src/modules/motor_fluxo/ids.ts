// Ids opacos dos botoes interativos do fluxo. Ficam aqui (nao num node) para que os nodes
// nao se importem entre si: cada node le os ids deste modulo comum. Sao referencias de botao,
// sempre revalidadas pelo node contra o estado/loja antes de virar efeito.

export const BOTAO_CONFIRMAR = 'conf:ok'
export const BOTAO_MAIS = 'conf:mais'
export const BOTAO_CANCELAR = 'conf:cancelar'

export const BOTAO_END_ULTIMO = 'end:ultimo'
export const BOTAO_END_NOVO = 'end:novo'

export const BOTAO_PAG_PIX = 'pag:pix'
export const BOTAO_PAG_DINHEIRO = 'pag:dinheiro'
export const BOTAO_PAG_CARTAO = 'pag:cartao'
