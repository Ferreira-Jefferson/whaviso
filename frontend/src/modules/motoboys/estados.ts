// Apresentacao dos motoboys: rotulos de veiculo, tipo de chave Pix e dia de negocio.
// Nada de regra de negocio aqui: o total do dia e derivado pelo servidor.
import type { TipoChavePix, TipoVeiculo } from '@/shared/contracts/_generated/enums'

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

/** Hoje em America/Sao_Paulo como 'YYYY-MM-DD' (dia de negocio; o UTC do navegador nao serve). */
export function hojeSaoPaulo(): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  return p // en-CA formata como YYYY-MM-DD
}

/** 'YYYY-MM-DD' -> 'dd/MM/yyyy' sem passar por Date (evita deslocar o dia pelo fuso). */
export function dataBr(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}
