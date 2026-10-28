// Pix Copia e Cola (BR Code estatico), padrao EMV do Banco Central: funcao PURA, sem integracao
// externa paga nem gateway, sem I/O e sem dependencia do barrel de contratos (so o TIPO da chave).
// Promovido para o kernel compartilhado (`@whaviso/shared/pix`) para que a api (modulo pagamentos)
// e o atendente (motor, no de pix) gerem o MESMO BR Code sem um importar o outro (integracao so
// por banco): ambos consomem este builder puro. Nunca loga nada (a chave e o titular sao dado
// sensivel; quem chama decide se loga o resultado, esta funcao em si nunca loga).
import type { TipoChavePix } from '../contracts/enums'

// Campo "cidade" do titular (decisao ja tomada): o cadastro de chave pix nao guarda a cidade real
// do titular. Quando ela nao vem, usamos um placeholder FIXO e generico (curto o bastante para o
// limite de 15 caracteres do campo Merchant City do spec EMV), em vez de inferir a cidade.
const CIDADE_PLACEHOLDER = 'BRASIL'

// GUI (Globally Unique Identifier) do arranjo Pix dentro do Merchant Account Information (campo 26).
// Fixo pelo Banco Central; a comparacao no lado do banco e case-insensitive, mas o manual usa minusculas.
const GUI_PIX = 'br.gov.bcb.pix'

/** Monta um campo EMV Tag-Length-Value: ID (2 digitos) + tamanho (2 digitos) + valor. */
function tlv(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, '0')}${valor}`
}

const MARCAS_DIACRITICAS = /[̀-ͯ]/g

// Remove acentuacao e qualquer caractere fora do ASCII imprimivel basico: os campos de texto do EMV
// (nome/cidade) usam o charset alfanumerico especial (ANS), que nao inclui acento. Sem isso, o
// tamanho declarado no TLV (em caracteres) poderia nao bater com o que o leitor de QR conta.
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
 * CRC16/CCITT-FALSE (polinomio 0x1021, inicio 0xFFFF, sem reflexao, sem XOR final): o checksum
 * exigido no campo final (63) de todo payload EMV/Pix, calculado sobre TODO o conteudo anterior,
 * incluindo o proprio identificador+tamanho do campo 63 ("6304"). Algoritmo conferido contra o
 * vetor de referencia oficial do manual do Pix e contra o vetor padrao do CRC16/CCITT-FALSE.
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
  /** Chave pix (qualquer tipo aceito pelo DICT: cpf/cnpj/email/telefone/aleatoria). */
  chave: string
  /** Tipo da chave, quando conhecido: normaliza para o formato exato do DICT antes de embutir no
   *  campo 26 (ver `normalizarChaveDict`). Sem tipo, a chave vai como veio (melhor esforco). */
  tipo?: TipoChavePix | null
  /** Nome de quem recebe (Merchant Name do EMV, campo 59); truncado a 25 caracteres. */
  nomeTitular: string
  /** Valor combinado, em CENTAVOS. Ausente/nulo/<=0: BR Code sem valor fixo (quem paga digita). */
  valorCentavos?: number | null
  /** Identificador da transacao (Reference Label, subcampo 05 do campo 62); sem valor vira "***". */
  identificador?: string | null
  /** Cidade do titular (Merchant City, campo 60); truncada a 15 caracteres. Vazia/ausente cai no
   *  placeholder fixo (`CIDADE_PLACEHOLDER`). API-pagamentos passa a cidade real da loja. */
  cidade?: string | null
}

// O cadastro da chave (wizard/painel) guarda texto livre de proposito (UX, nao validacao). Mas o
// campo 26 do EMV exige a chave no formato EXATO do DICT, e um recebedor digita/cola CPF, CNPJ e
// telefone com pontuacao com naturalidade. Sem normalizar aqui, o BR Code sai com CRC e estrutura
// validos (escaneia normal) mas com uma chave que o DICT nao reconhece: o banco do pagador recusa
// por "chave nao encontrada". aleatoria (UUID) e email ja chegam no formato do DICT, entao seguem intactos.
function normalizarChaveDict(chave: string, tipo?: TipoChavePix | null): string {
  const valor = chave.trim()
  if (tipo === 'cpf' || tipo === 'cnpj') return valor.replace(/\D/g, '')
  if (tipo === 'telefone') {
    const digitos = valor.replace(/\D/g, '')
    // Sem "+", so conta com codigo de pais ja embutido quando vem 12-13 digitos comecando em 55.
    // Qualquer outro tamanho e DDD+numero BR sem o "55" e precisa ganhar o prefixo para virar E.164.
    const jaTemCodigoPais =
      valor.startsWith('+') || (digitos.length >= 12 && digitos.length <= 13 && digitos.startsWith('55'))
    return jaTemCodigoPais ? `+${digitos}` : `+55${digitos}`
  }
  return valor
}

/**
 * Gera o payload do Pix Copia e Cola (BR Code ESTATICO/reutilizavel), seguindo o padrao EMV
 * Merchant Presented Mode do Banco Central: funcao pura (sem chamada de rede, sem gateway pago), o
 * transporte so copia o texto retornado na mensagem. Nunca loga nada (a chave e o titular sao dado
 * sensivel; quem chama decide se loga o resultado, mas esta funcao em si nao loga).
 */
export function gerarPayloadPixCopiaCola(dados: DadosPixCopiaCola): string {
  const chave = normalizarChaveDict(dados.chave, dados.tipo)
  const nome = truncar(normalizarAscii(dados.nomeTitular).toUpperCase() || 'RECEBEDOR', 25)
  const cidade = truncar(normalizarAscii(dados.cidade ?? '').toUpperCase(), 15) || CIDADE_PLACEHOLDER
  const identificadorBruto = normalizarAscii(dados.identificador ?? '').toUpperCase()
  const identificador = truncar(identificadorBruto, 25) || '***'

  const merchantAccountInfo = tlv('00', GUI_PIX) + tlv('01', chave)
  const valorValido = dados.valorCentavos != null && dados.valorCentavos > 0

  let semCrc =
    tlv('00', '01') + // Payload Format Indicator (fixo)
    tlv('01', '11') + // Point of Initiation Method: 11 = estatico/reutilizavel
    tlv('26', merchantAccountInfo) + // Merchant Account Information (Pix: GUI + chave)
    tlv('52', '0000') + // Merchant Category Code: nao informado
    tlv('53', '986') + // Transaction Currency: 986 = BRL (ISO 4217)
    (valorValido ? tlv('54', (dados.valorCentavos! / 100).toFixed(2)) : '') +
    tlv('58', 'BR') + // Country Code
    tlv('59', nome) + // Merchant Name
    tlv('60', cidade) + // Merchant City (cidade da loja ou placeholder fixo)
    tlv('62', tlv('05', identificador)) // Additional Data Field Template: Reference Label

  semCrc += '6304' // ID + tamanho do proprio campo CRC, ANTES de calcular o checksum
  return semCrc + crc16(semCrc)
}

/**
 * Valida um payload Pix Copia e Cola conferindo o CRC16 do campo 63 (o checksum tem que bater com o
 * recalculo sobre todo o conteudo anterior, inclusive "6304"). Funcao PURA, usada pela api e pelo
 * atendente para garantir que o BR Code gerado/recebido nao foi corrompido. Nao valida a chave
 * contra o DICT (isso so o banco do pagador resolve): confere so a integridade.
 */
export function validarBrCode(payload: string): boolean {
  if (typeof payload !== 'string' || payload.length < 8) return false
  const corpo = payload.slice(0, -4)
  const crc = payload.slice(-4)
  if (!/^[0-9A-F]{4}$/.test(crc)) return false
  // O payload tem que terminar com o identificador+tamanho do campo CRC ("6304") antes do valor.
  if (!corpo.endsWith('6304')) return false
  return crc16(corpo) === crc
}
