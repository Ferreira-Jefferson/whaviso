// Kernel de cifra compartilhado do monorepo (@whaviso/shared/cifra).
//
// Uma unica forma de cifra, hash e normalizacao de telefone para api, zap e atendente:
// o token cifrado pela api e decifrado pelo zap com a MESMA MASTER_KEY, e o hash de
// telefone bate entre modulos (dedupe/busca). Antes existiam duas implementacoes locais
// divergentes (clientes com HMAC+pepper; numeros com sha256(MASTER_KEY)); esta as substitui.
//
// A MASTER_KEY (min 32 chars) chega SEMPRE por configuracao (env), NUNCA do codigo e NUNCA
// do log. As chaves AES e HMAC sao derivadas dela com SEPARACAO DE DOMINIO (strings distintas),
// de proposito: a mesma MASTER_KEY nunca serve crua a dois usos diferentes.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'

const VERSAO_V1 = 0x01
const TAM_NONCE = 12
const TAM_TAG = 16
const MIN_MASTER_KEY = 32

// Separacao de dominio: rotulos distintos por uso. Trocar um rotulo invalida o material
// derivado (migracao de versao), por isso eles sao estaveis e versionados (v1).
const DOMINIO_CIFRA = 'whaviso/cifra/v1'
const DOMINIO_HASH = 'whaviso/telefone-hash/v1'

/** Erro tipado da cifra; mensagem generica (nunca inclui claro, chave nem material cru). */
export class ErroCifra extends Error {
  constructor(message = 'falha na cifra') {
    super(message)
    this.name = 'ErroCifra'
  }
}

/** Kernel de cifra ligado a uma MASTER_KEY. Reutilizavel; nunca expoe a chave. */
export interface Cifra {
  /** AES-256-GCM. Saida versionada: versao(1) | nonce(12) | tag(16) | ciphertext. */
  cifrar(claro: Buffer): Buffer
  /** Inverso de `cifrar`. Lanca ErroCifra em versao desconhecida, malformado ou adulteracao. */
  decifrar(cifrado: Buffer): Buffer
  /** HMAC-SHA256 hex (64) do E.164 normalizado: dedupe/busca sem guardar o numero. */
  hashTelefone(telefoneE164: string): string
  /** E.164 `+55...` (valida DDD e 9o digito) ou null se invalido. */
  normalizarTelefoneBR(entrada: string): string | null
  /** `+55 ** *****-1234`: so os 4 ultimos digitos. */
  mascararTelefone(e164: string): string
}

/** E.164 BR (+55DDNNNNNNNNN); null se invalido. Aceita +55, 0055 e pontuacao. */
export function normalizarTelefoneBR(entrada: string): string | null {
  const t = entrada.trim()
  if (!/^[\d\s()+\-.]+$/.test(t)) return null
  let d = t.replace(/\D/g, '')
  if (t.startsWith('+') && !d.startsWith('55')) return null
  if (d.startsWith('00')) d = d.slice(2)
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  else if (d.length !== 10 && d.length !== 11) return null
  const ddd = d.slice(0, 2)
  const local = d.slice(2)
  if (!/^[1-9][1-9]$/.test(ddd)) return null
  if (local.length === 9 && local[0] !== '9') return null
  if (local.length === 8 && !/^[2-9]/.test(local)) return null
  return `+55${d}`
}

/** `+55 ** *****-1234`: mascara tudo menos os 4 ultimos digitos. */
export function mascararTelefone(e164: string): string {
  return `+55 ** *****-${e164.slice(-4)}`
}

/** Chave AES de 32 bytes derivada da MASTER_KEY com o dominio da cifra. */
function derivarChaveCifra(masterKey: string): Buffer {
  return createHash('sha256').update(DOMINIO_CIFRA + masterKey, 'utf8').digest()
}

/** Chave HMAC de 32 bytes derivada da MASTER_KEY com o dominio do hash (dominio != cifra). */
function derivarChaveHash(masterKey: string): Buffer {
  return createHash('sha256').update(DOMINIO_HASH + masterKey, 'utf8').digest()
}

/**
 * Cria a cifra a partir da MASTER_KEY (min 32 chars). Injete a chave nos testes sem env.
 * Duas instancias com a MESMA MASTER_KEY sao interoperaveis (api cifra, zap decifra).
 */
export function criarCifra(masterKey: string): Cifra {
  if (typeof masterKey !== 'string' || masterKey.length < MIN_MASTER_KEY) {
    throw new ErroCifra('MASTER_KEY invalida (minimo 32 caracteres)')
  }
  const chaveCifra = derivarChaveCifra(masterKey)
  const chaveHash = derivarChaveHash(masterKey)

  return {
    cifrar(claro: Buffer): Buffer {
      if (!Buffer.isBuffer(claro)) throw new ErroCifra('claro deve ser Buffer')
      const nonce = randomBytes(TAM_NONCE)
      const cifra = createCipheriv('aes-256-gcm', chaveCifra, nonce)
      const ct = Buffer.concat([cifra.update(claro), cifra.final()])
      const tag = cifra.getAuthTag()
      return Buffer.concat([Buffer.from([VERSAO_V1]), nonce, tag, ct])
    },

    decifrar(cifrado: Buffer): Buffer {
      if (!Buffer.isBuffer(cifrado) || cifrado.length < 1 + TAM_NONCE + TAM_TAG) {
        throw new ErroCifra('cifrado malformado')
      }
      if (cifrado[0] !== VERSAO_V1) throw new ErroCifra('versao de cifra desconhecida')
      const nonce = cifrado.subarray(1, 1 + TAM_NONCE)
      const tag = cifrado.subarray(1 + TAM_NONCE, 1 + TAM_NONCE + TAM_TAG)
      const ct = cifrado.subarray(1 + TAM_NONCE + TAM_TAG)
      const decifra = createDecipheriv('aes-256-gcm', chaveCifra, nonce)
      decifra.setAuthTag(tag)
      try {
        return Buffer.concat([decifra.update(ct), decifra.final()])
      } catch {
        // Tag invalida (adulteracao) ou chave errada: falha fechada, sem detalhe.
        throw new ErroCifra('autenticacao da cifra falhou')
      }
    },

    hashTelefone(telefoneE164: string): string {
      const norm = normalizarTelefoneBR(telefoneE164)
      if (!norm) throw new ErroCifra('telefone invalido para hash')
      return createHmac('sha256', chaveHash).update(norm).digest('hex')
    },

    normalizarTelefoneBR,
    mascararTelefone,
  }
}

// Default preguicoso: le MASTER_KEY da env no primeiro uso real, valida e cacheia.
// O registro de modulos no boot nunca quebra so por construir a cifra; quem nao
// configurou MASTER_KEY so falha quando a cifra e de fato usada.
let cifraPadraoCache: Cifra | undefined

/** Cifra padrao do processo, derivada de `process.env.MASTER_KEY` (lazy, cacheada). */
export function cifraPadrao(): Cifra {
  if (!cifraPadraoCache) {
    const mk = process.env['MASTER_KEY']
    if (!mk || mk.length < MIN_MASTER_KEY) {
      throw new ErroCifra('MASTER_KEY ausente ou invalida (minimo 32 caracteres)')
    }
    cifraPadraoCache = criarCifra(mk)
  }
  return cifraPadraoCache
}
