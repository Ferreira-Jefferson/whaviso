// Converte o rascunho aprovado no LOTE a criar no cardapio (formato das entradas do modulo
// cardapio). Funcao pura: a importacao nunca escreve nas tabelas do cardapio.
import type { CardapioLote, RascunhoCardapio } from './schemas'

export function rascunhoParaLote(r: RascunhoCardapio): CardapioLote {
  return {
    categorias: r.categorias.map((c) => ({
      nome: c.nome,
      descricao: c.descricao,
      itens: c.itens.map((i) => ({
        nome: i.nome,
        descricao: i.descricao,
        preco_centavos: i.preco_centavos,
        grupos: i.grupos.map((g) => ({
          nome: g.nome,
          tipo: 'customizado' as const,
          obrigatorio: g.obrigatorio,
          min_escolhas: g.obrigatorio ? 1 : 0,
          max_escolhas: g.max_escolhas,
          opcoes: g.opcoes.map((o) => ({ nome: o.nome, preco_centavos: o.preco_centavos })),
        })),
      })),
    })),
  }
}
