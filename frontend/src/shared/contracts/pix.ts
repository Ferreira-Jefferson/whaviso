// ESPELHO de backend/packages/shared/src/contracts/pix.ts. O front não importa
// @whaviso/shared, então a lógica de detecção do tipo da chave é uma CÓPIA da do backend
// (fonte única no backend, reusada por api + zap). Mudar a detecção = mudar os DOIS lados.
//
// Convenções do Pix (DICT) para desambiguar:
//  - email:     contém @ e parece um e-mail.
//  - aleatoria: chave EVP no formato UUID (8-4-4-4-12 hex).
//  - telefone:  o DICT valida em E.164 (^\+[1-9]\d{1,14}$), NÃO é exclusivo de +55; com
//               o +, qualquer país conta. Sem o +, só inferimos quando vêm 12-13 dígitos
//               começando em 55 (um celular BR sem país tem 11 dígitos, IGUAL ao CPF).
//  - cnpj:      14 dígitos.  cpf: 11 dígitos.
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
  if (digitos.length === 11) return 'cpf'
  return null
}
