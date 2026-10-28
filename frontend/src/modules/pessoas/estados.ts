// Rotulos de apresentacao do cadastro de entrega da pessoa (cargo motoboy): veiculo, tipo de chave
// Pix e regime de pagamento. Espelha os rotulos usados no cadastro de entrega; este modulo NUNCA
// importa o modulo motoboys (fronteira feature-first), por isso os rotulos vivem aqui.
import type {
  PeriodicidadeFixo,
  RegimePagamento,
  TipoChavePix,
  TipoVeiculo,
} from '@/shared/contracts/_generated/enums'
import type { PessoaEntregaDto } from '@/shared/contracts/_generated/pessoas'

export const ROTULO_VEICULO: Record<TipoVeiculo, string> = {
  moto: 'Moto',
  bicicleta: 'Bicicleta',
  carro: 'Carro',
  a_pe: 'A pé',
}
export const VEICULOS: readonly TipoVeiculo[] = ['moto', 'bicicleta', 'carro', 'a_pe']

export const ROTULO_PIX: Record<TipoChavePix, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  telefone: 'Telefone',
  aleatoria: 'Chave aleatória',
}
export const TIPOS_PIX: readonly TipoChavePix[] = ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria']

export const PLACEHOLDER_PIX: Record<TipoChavePix, string> = {
  cpf: '000.000.000-00',
  cnpj: '00.000.000/0000-00',
  email: 'nome@email.com',
  telefone: '+55 11 99999-9999',
  aleatoria: 'Chave aleatória',
}

export const ROTULO_REGIME: Record<RegimePagamento, string> = {
  por_entrega: 'Por entrega',
  fixo: 'Fixo',
  fixo_mais_entrega: 'Fixo + entregas',
}
export const REGIMES: readonly RegimePagamento[] = ['por_entrega', 'fixo', 'fixo_mais_entrega']

export const ROTULO_PERIODICIDADE: Record<PeriodicidadeFixo, string> = {
  dia: 'Por dia',
  mes: 'Por mês',
}
export const PERIODICIDADES: readonly PeriodicidadeFixo[] = ['dia', 'mes']

/** Estado do formulario de entrega (secao visivel so no cargo motoboy). */
export interface EntregaForm {
  veiculo: TipoVeiculo
  placa: string
  pixTipo: TipoChavePix
  pix: string
  removerPix: boolean
  regime: RegimePagamento
  periodicidade: PeriodicidadeFixo
  valorFixo: number | null
}

/** Estado inicial da secao a partir do detalhe (entrega atual da pessoa, ou vazia). */
export function entregaInicial(atual: PessoaEntregaDto | null): EntregaForm {
  return {
    veiculo: atual?.veiculo ?? 'moto',
    placa: atual?.placa ?? '',
    pixTipo: atual?.pix_tipo ?? 'cpf',
    pix: '',
    removerPix: false,
    regime: atual?.regime_pagamento ?? 'por_entrega',
    periodicidade: atual?.periodicidade_fixo ?? 'dia',
    valorFixo: atual?.valor_fixo_centavos ?? null,
  }
}
