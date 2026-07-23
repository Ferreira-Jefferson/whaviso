// Inferência do TIPO de uma chave pix a partir do formato. FONTE ÚNICA
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

// Rótulo de EXIBIÇÃO do tipo (leitura humana no WhatsApp/painel). FONTE ÚNICA: o zap
// (resposta.ver_pix, wizard E14) e a api compartilham daqui; o front espelha em
// ROTULO_TIPO_CHAVE. Não é validação, só apresentação.
export const ROTULO_TIPO_CHAVE: Record<TipoChavePix, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  telefone: 'Telefone',
  aleatoria: 'Chave aleatória',
}

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

// ---------------------------------------------------------------------------------
// Pix Copia e Cola (BR Code estático), padrão EMV do Banco Central (item 23, decisão
// 2026-07-22): função PURA, sem integração externa paga nem gateway. O zap só usa o
// texto retornado como conteúdo adicional de uma mensagem já existente (a chave
// segue vindo do banco); esta função não conhece banco nem transporte.
//
// Campo "cidade" do titular (decisão já tomada): o cadastro de chave pix não guarda
// a cidade real do titular, e não é escopo deste item adicionar esse campo. Por isso
// usamos um placeholder FIXO e genérico (curto o bastante para o limite de 15
// caracteres do campo Merchant City do spec EMV), em vez de tentar inferir a cidade.
const CIDADE_PLACEHOLDER = 'BRASIL'

// GUI (Globally Unique Identifier) do arranjo Pix dentro do Merchant Account
// Information (campo 26). Fixo pelo Banco Central; a comparação no lado do banco é
// case-insensitive, mas o manual usa minúsculas.
const GUI_PIX = 'br.gov.bcb.pix'

/** Monta um campo EMV Tag-Length-Value: ID (2 dígitos) + tamanho (2 dígitos) + valor. */
function tlv(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, '0')}${valor}`
}

const MARCAS_DIACRITICAS = /[̀-ͯ]/g

// Remove acentuação e qualquer caractere fora do ASCII imprimível básico: os campos
// de texto do EMV (nome/cidade) usam o charset alfanumérico especial (ANS), que não
// inclui acento. Sem isso, o tamanho declarado no TLV (em caracteres) poderia não
// bater com o que o leitor de QR conta, ou o campo ficaria com bytes inesperados.
function normalizarAscii(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(MARCAS_DIACRITICAS, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
}

function truncar(texto: string, maximo: number): string {
  return texto.slice(0, maximo)
}

/**
 * CRC16/CCITT-FALSE (polinômio 0x1021, início 0xFFFF, sem reflexão, sem XOR final):
 * o checksum exigido no campo final (63) de todo payload EMV/Pix, calculado sobre
 * TODO o conteúdo anterior, incluindo o próprio identificador+tamanho do campo 63
 * ("6304"). Algoritmo conferido contra o vetor de referência oficial do manual do
 * Pix (Banco Central) e contra o vetor padrão de checagem do CRC16/CCITT-FALSE.
 */
function crc16(payload: string): string {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export interface DadosPixCopiaCola {
  /** Chave pix (qualquer tipo aceito pelo DICT: cpf/cnpj/email/telefone/aleatória). */
  chave: string
  /** Nome de quem recebe (Merchant Name do EMV, campo 59); truncado a 25 caracteres. */
  nomeTitular: string
  /** Valor combinado, em CENTAVOS. Ausente/nulo/<=0: BR Code sem valor fixo (quem paga digita). */
  valorCentavos?: number | null
  /** Identificador da transação (Reference Label, subcampo 05 do campo 62); sem valor
   *  vira "***" (marcador padrão do spec para "sem identificador"). */
  identificador?: string | null
}

/**
 * Gera o payload do Pix Copia e Cola (BR Code ESTÁTICO/reutilizável), seguindo o
 * padrão EMV Merchant Presented Mode do Banco Central: função pura (sem chamada de
 * rede, sem gateway pago), o transporte só copia o texto retornado na mensagem.
 * Nunca loga nada (a chave e o titular são dado sensível; quem chama decide se loga
 * o resultado, mas esta função em si não loga).
 */
export function gerarPayloadPixCopiaCola(dados: DadosPixCopiaCola): string {
  const chave = dados.chave.trim()
  const nome = truncar(normalizarAscii(dados.nomeTitular).toUpperCase() || 'RECEBEDOR', 25)
  const identificadorBruto = normalizarAscii(dados.identificador ?? '').toUpperCase()
  const identificador = truncar(identificadorBruto, 25) || '***'

  const merchantAccountInfo = tlv('00', GUI_PIX) + tlv('01', chave)
  const valorValido = dados.valorCentavos != null && dados.valorCentavos > 0

  let semCrc =
    tlv('00', '01') + // Payload Format Indicator (fixo)
    tlv('01', '11') + // Point of Initiation Method: 11 = estático/reutilizável
    tlv('26', merchantAccountInfo) + // Merchant Account Information (Pix: GUI + chave)
    tlv('52', '0000') + // Merchant Category Code: não informado
    tlv('53', '986') + // Transaction Currency: 986 = BRL (ISO 4217)
    (valorValido ? tlv('54', (dados.valorCentavos! / 100).toFixed(2)) : '') +
    tlv('58', 'BR') + // Country Code
    tlv('59', nome) + // Merchant Name
    tlv('60', CIDADE_PLACEHOLDER) + // Merchant City (placeholder fixo, ver decisão acima)
    tlv('62', tlv('05', identificador)) // Additional Data Field Template: Reference Label

  semCrc += '6304' // ID + tamanho do próprio campo CRC, ANTES de calcular o checksum
  return semCrc + crc16(semCrc)
}
