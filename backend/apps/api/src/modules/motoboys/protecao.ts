// Normalizacao e protecao dos campos sensiveis do motoboy (Pix) e da placa. Funcoes puras: nada
// aqui loga nem devolve o claro alem do que o chamador pede. O hash e sha256 (formato exigido pela
// constraint motoboys_pix_hash_fmt) do Pix normalizado, com o tipo no preimagem.
import { createHash } from 'node:crypto'
import type { TipoChavePix } from '@whaviso/shared/contracts'
import type { Cifra } from './cripto'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Chave Pix na forma canonica do tipo; null se o formato nao confere com o tipo. */
export function normalizarPix(tipo: TipoChavePix, bruto: string, cifra: Cifra): string | null {
  const v = bruto.trim()
  switch (tipo) {
    case 'cpf': {
      const d = v.replace(/\D/g, '')
      return d.length === 11 ? d : null
    }
    case 'cnpj': {
      const d = v.replace(/\D/g, '')
      return d.length === 14 ? d : null
    }
    case 'telefone':
      return cifra.normalizarTelefoneBR(v)
    case 'email': {
      const e = v.toLowerCase()
      return EMAIL.test(e) ? e : null
    }
    case 'aleatoria': {
      const u = v.toLowerCase()
      return UUID.test(u) ? u : null
    }
  }
}

export function hashPix(tipo: TipoChavePix, normalizado: string): string {
  return createHash('sha256').update(`${tipo}:${normalizado}`, 'utf8').digest('hex')
}

/** Mascara de exibicao: so os 4 ultimos caracteres da chave normalizada. */
export const ultimos4 = (valor: string): string => valor.slice(-4)

const PLACA_ANTIGA = /^[A-Z]{3}[0-9]{4}$/
const PLACA_MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/

/** Placa em maiuscula sem separador (formato antigo ou Mercosul); null se invalida. */
export function normalizarPlaca(bruto: string): string | null {
  const p = bruto.toUpperCase().replace(/[\s-]/g, '')
  return PLACA_ANTIGA.test(p) || PLACA_MERCOSUL.test(p) ? p : null
}
