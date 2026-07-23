// Item 23 (2026-07-22): payload EMV do Pix Copia e Cola (BR Code estático). Cobre o
// CRC16 (recalculado de forma independente, sem reusar o crc16 interno do módulo) e a
// presença dos campos obrigatórios do spec (GUI+chave no 26, moeda/país no 53/58,
// nome/cidade no 59/60, CRC no 63).
import { describe, expect, it } from 'vitest'
import { gerarPayloadPixCopiaCola } from './pix'

/**
 * Reimplementação INDEPENDENTE do CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF), só
 * para o teste conferir o payload sem depender da mesma função usada em produção.
 * Conferida contra o vetor padrão de checagem do algoritmo: crc16('123456789') = 0x29B1.
 */
function crc16Independente(payload: string): string {
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

/** Faz o parse ingênuo de um payload EMV em campos {id: valor} de nível 1 (sem recursar
 *  nos templates aninhados como 26/62), suficiente para as asserções deste teste. */
function camposDeNivel1(payload: string): Record<string, string> {
  const campos: Record<string, string> = {}
  let i = 0
  while (i < payload.length) {
    const id = payload.slice(i, i + 2)
    const tamanho = Number(payload.slice(i + 2, i + 4))
    const valor = payload.slice(i + 4, i + 4 + tamanho)
    campos[id] = valor
    i += 4 + tamanho
  }
  return campos
}

describe('gerarPayloadPixCopiaCola (item 23, BR Code estático)', () => {
  it('vetor de checagem padrão do CRC16/CCITT-FALSE usado (garante que a reimplementação do teste está certa)', () => {
    expect(crc16Independente('123456789')).toBe('29B1')
  })

  it('CRC16 do payload gerado bate com um recalculo independente', () => {
    const payload = gerarPayloadPixCopiaCola({
      chave: '123e4567-e12b-12d1-a456-426655440000',
      nomeTitular: 'Fulano de Tal',
    })
    const semCrc = payload.slice(0, -4)
    const crc = payload.slice(-4)
    expect(crc).toHaveLength(4)
    expect(crc).toBe(crc16Independente(semCrc))
  })

  it('contém os campos obrigatórios do EMV (payload indicator, GUI+chave, moeda, país, CRC)', () => {
    const payload = gerarPayloadPixCopiaCola({
      chave: 'joao@example.com',
      nomeTitular: 'Joao da Silva',
    })
    const campos = camposDeNivel1(payload)
    expect(campos['00']).toBe('01') // Payload Format Indicator
    expect(campos['26']).toContain('br.gov.bcb.pix')
    expect(campos['26']).toContain('joao@example.com')
    expect(campos['53']).toBe('986') // BRL
    expect(campos['58']).toBe('BR')
    expect(campos['59']).toBeTruthy() // Merchant Name
    expect(campos['60']).toBeTruthy() // Merchant City
    expect(campos['63']).toHaveLength(4) // CRC
    expect(campos['54']).toBeUndefined() // sem valor: sem campo 54
  })

  it('com valorCentavos > 0, inclui o campo 54 no formato decimal (reais.centavos)', () => {
    const payload = gerarPayloadPixCopiaCola({
      chave: '+5511999999999',
      nomeTitular: 'Maria',
      valorCentavos: 105090,
    })
    const campos = camposDeNivel1(payload)
    expect(campos['54']).toBe('1050.90')
  })

  it('valorCentavos ausente, nulo ou zero/negativo: omite o campo 54 (sem valor fixo)', () => {
    for (const valorCentavos of [undefined, null, 0, -100]) {
      const payload = gerarPayloadPixCopiaCola({ chave: 'x@x.com', nomeTitular: 'X', valorCentavos })
      expect(camposDeNivel1(payload)['54']).toBeUndefined()
    }
  })

  it('usa a cidade placeholder fixa (não depende de dado de cadastro real)', () => {
    const payload = gerarPayloadPixCopiaCola({ chave: 'x@x.com', nomeTitular: 'X' })
    expect(camposDeNivel1(payload)['60']).toBe('BRASIL')
  })

  it('remove acentuação do nome do titular (charset ASCII do EMV)', () => {
    const payload = gerarPayloadPixCopiaCola({ chave: 'x@x.com', nomeTitular: 'José André Ção' })
    const nome = camposDeNivel1(payload)['59']!
    expect(nome).toBe('JOSE ANDRE CAO')
    expect(nome).not.toMatch(/[^\x20-\x7E]/)
  })

  it('trunca o nome do titular em 25 caracteres (limite do Merchant Name)', () => {
    const nomeLongo = 'Um Nome de Titular Bem Comprido de Verdade'
    const payload = gerarPayloadPixCopiaCola({ chave: 'x@x.com', nomeTitular: nomeLongo })
    expect(camposDeNivel1(payload)['59']!.length).toBeLessThanOrEqual(25)
  })

  it('sem identificador, usa o marcador "***" (sem referência) no subcampo 05 do 62', () => {
    const payload = gerarPayloadPixCopiaCola({ chave: 'x@x.com', nomeTitular: 'X' })
    expect(camposDeNivel1(payload)['62']).toBe('0503***')
  })

  it('com identificador, usa o valor sanitizado (maiúsculo, sem acento) no subcampo 05', () => {
    const payload = gerarPayloadPixCopiaCola({
      chave: 'x@x.com',
      nomeTitular: 'X',
      identificador: 'aviso-123',
    })
    const campo62 = camposDeNivel1(payload)['62']!
    expect(campo62).toContain('AVISO-123')
  })

  it('nome vazio cai no fallback neutro RECEBEDOR (nunca campo vazio)', () => {
    const payload = gerarPayloadPixCopiaCola({ chave: 'x@x.com', nomeTitular: '   ' })
    expect(camposDeNivel1(payload)['59']).toBe('RECEBEDOR')
  })
})
