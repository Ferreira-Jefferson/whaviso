// Apresentacao do caixa (PDV): rotulos das formas de pagamento e dos tipos de movimento,
// mais a configuracao visual de cada dialog de movimento (venda/sangria/suprimento).
// Nada de regra de negocio aqui: o saldo calculado e a diferenca sao decididos pelo servidor.
import type { FormaPagamento, TipoMovimentoCaixa } from '@/shared/contracts/_generated/caixa'

export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  credito: 'Crédito',
  debito: 'Débito',
  pix: 'Pix',
  outro: 'Outro',
}

/** Ordem de exibicao das formas de pagamento (vendas). */
export const FORMAS_PAGAMENTO: readonly FormaPagamento[] = ['dinheiro', 'credito', 'debito', 'pix', 'outro']

export const ROTULO_TIPO_MOVIMENTO: Record<TipoMovimentoCaixa, string> = {
  venda: 'Venda',
  sangria: 'Sangria',
  suprimento: 'Suprimento',
  ajuste: 'Ajuste',
}

/** Tipos de movimento que o operador lanca a mao nesta tela (o `ajuste` nasce do fechamento). */
export type TipoMovimentoManual = 'venda' | 'sangria' | 'suprimento'

export interface ConfigMovimento {
  titulo: string
  confirmar: string
  descricao: string
  rotuloValor: string
  /** Venda escolhe forma de pagamento; sangria/suprimento nao. */
  comForma: boolean
}

export const CONFIG_MOVIMENTO: Record<TipoMovimentoManual, ConfigMovimento> = {
  venda: {
    titulo: 'Registrar venda',
    confirmar: 'Registrar venda',
    descricao: 'Lance uma venda e escolha a forma de pagamento.',
    rotuloValor: 'Valor da venda',
    comForma: true,
  },
  sangria: {
    titulo: 'Sangria',
    confirmar: 'Registrar sangria',
    descricao: 'Retirada de dinheiro da gaveta (sem venda).',
    rotuloValor: 'Valor retirado',
    comForma: false,
  },
  suprimento: {
    titulo: 'Suprimento',
    confirmar: 'Registrar suprimento',
    descricao: 'Entrada de troco ou reforço na gaveta (sem venda).',
    rotuloValor: 'Valor adicionado',
    comForma: false,
  },
}

/** Tom da diferenca de fechamento: zero = bateu, positivo = sobra, negativo = falta. */
export type TomDiferenca = 'exato' | 'sobra' | 'falta'

export function tomDaDiferenca(diferencaCentavos: number): TomDiferenca {
  if (diferencaCentavos === 0) return 'exato'
  return diferencaCentavos > 0 ? 'sobra' : 'falta'
}

export const ROTULO_DIFERENCA: Record<TomDiferenca, string> = {
  exato: 'O valor conferido bate com o esperado.',
  sobra: 'Sobra em relação ao esperado.',
  falta: 'Falta em relação ao esperado.',
}
