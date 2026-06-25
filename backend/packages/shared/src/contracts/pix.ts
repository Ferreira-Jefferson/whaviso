// Inferência do TIPO de uma chave de pagamento a partir do formato. FONTE ÚNICA
// (api + zap): o front mantém uma cópia espelhada (não importa @whaviso/shared), como
// as regras de linguagem. Auxílio de UX/automação, não validação: o backend guarda
// tipo + chave sem validar um contra o outro.
//
// Convenções do Pix (DICT) para desambiguar:
//  - email:     contém @ e parece um e-mail.
//  - aleatoria: chave EVP no formato UUID (8-4-4-4-12 hex).
//  - telefone:  o DICT valida em E.164 (^\+[1-9]\d{1,14}$), NÃO é exclusivo de +55; com
//               o +, qualquer país conta. Sem o +, só inferimos quando vêm 12-13 dígitos
//               começando em 55 (um celular BR sem país tem 11 dígitos, IGUAL ao CPF, e
//               aí não dá para saber).
//  - cnpj:      14 dígitos.
//  - cpf:       11 dígitos QUE passam nos dígitos verificadores. Um celular BR sem país
//               também tem 11 dígitos; o checksum separa os dois (um telefone quase nunca
//               passa), então só sugerimos "parece CPF" quando o CPF é de fato válido.
// Quando não há confiança suficiente (incompleto/ambíguo), devolve null.
import type { TipoChavePix } from './enums'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Adivinha o tipo da chave Pix a partir do texto, ou null se ambíguo/incompleto. */
export function detectarTipoChavePix(bruto: string): TipoChavePix | null {
  const v = bruto.trim()
  if (!v) return null

  if (v.includes('@')) return EMAIL.test(v) ? 'email' : null
  if (UUID.test(v)) return 'aleatoria'

  const digitos = v.replace(/\D/g, '')
  if (v.startsWith('+')) {
    return digitos.length >= 8 && digitos.length <= 15 ? 'telefone' : null
  }
  if (digitos.length >= 12 && digitos.length <= 13 && digitos.startsWith('55')) {
    return 'telefone'
  }
  if (digitos.length === 14) return 'cnpj'
  if (cpfValido(digitos)) return 'cpf'
  return null
}

// Confere os dois dígitos verificadores do CPF. É o que separa um CPF de um celular BR
// sem país (ambos com 11 dígitos): um telefone quase nunca fecha o checksum. Rejeita
// também sequências repetidas (000…, 111…), que passam na conta mas não são CPF.
function cpfValido(digitos: string): boolean {
  if (digitos.length !== 11 || /^(\d)\1{10}$/.test(digitos)) return false
  const dv = (ate: number): number => {
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(digitos[i]) * (ate + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return dv(9) === Number(digitos[9]) && dv(10) === Number(digitos[10])
}
