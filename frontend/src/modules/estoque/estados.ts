// Apresentacao do estoque: rotulos e helpers de texto/quantidade. Nenhuma regra de negocio
// aqui (saldos e flags vem resolvidos do servidor). Quantidade e decimal (numeric(14,3)):
// NAO e dinheiro, entao nao passa por brl/MoneyText; formatamos como numero pt-BR.
import {
  UNIDADES_INSUMO,
  TIPOS_MOVIMENTO_INSUMO_PAINEL,
  TODOS_TIPOS_MOVIMENTO_INSUMO,
} from '@/shared/contracts/_generated/estoque_insumos'

// Tipos derivados dos catalogos (const arrays), sem depender dos enums Zod.
type Unidade = (typeof UNIDADES_INSUMO)[number]
type TipoPainel = (typeof TIPOS_MOVIMENTO_INSUMO_PAINEL)[number]
type Tipo = (typeof TODOS_TIPOS_MOVIMENTO_INSUMO)[number]

export const ROTULO_UNIDADE: Record<Unidade, string> = {
  kg: 'Quilograma (kg)',
  g: 'Grama (g)',
  l: 'Litro (L)',
  ml: 'Mililitro (ml)',
  un: 'Unidade (un)',
  cx: 'Caixa (cx)',
  pct: 'Pacote (pct)',
  dz: 'Duzia (dz)',
}

export const OPCOES_UNIDADE = UNIDADES_INSUMO.map((value) => ({
  value,
  label: ROTULO_UNIDADE[value],
}))

export const ROTULO_TIPO_MOVIMENTO: Record<Tipo, string> = {
  entrada: 'Entrada',
  saida: 'Saida',
  ajuste: 'Ajuste de saldo',
  consumo: 'Consumo (venda)',
}

/** Explica, em uma linha, o efeito do tipo no saldo (texto de apoio no dialog). */
export const DICA_TIPO_MOVIMENTO: Record<TipoPainel, string> = {
  entrada: 'Soma ao saldo atual (compra, reposicao).',
  saida: 'Subtrai do saldo atual (perda, quebra, uso manual).',
  ajuste: 'Define o saldo como o valor informado (recontagem).',
}

export const OPCOES_TIPO_MOVIMENTO = TIPOS_MOVIMENTO_INSUMO_PAINEL.map((value) => ({
  value,
  label: ROTULO_TIPO_MOVIMENTO[value],
}))

/** Numero pt-BR com ate 3 casas decimais, sem casas a mais que o necessario. */
export function formatarQuantidade(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

/** Saldo + unidade curta, ex.: "12,5 kg". */
export function saldoComUnidade(quantidade: number, unidade: string): string {
  return `${formatarQuantidade(quantidade)} ${unidade}`
}

/**
 * Converte o texto digitado (pt-BR ou com ponto) em numero >= 0, ou null se invalido/vazio.
 * Aceita virgula ou ponto como separador decimal; nao e dinheiro (quantidade fisica).
 */
export function parseQuantidade(texto: string): number | null {
  const limpo = texto.trim().replace(/\s/g, '').replace(',', '.')
  if (limpo === '') return null
  if (!/^\d*\.?\d*$/.test(limpo)) return null
  const n = Number(limpo)
  return Number.isFinite(n) && n >= 0 ? n : null
}
