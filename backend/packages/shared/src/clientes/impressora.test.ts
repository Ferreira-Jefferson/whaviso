import { describe, expect, it } from 'vitest'
import {
  comandaEscPos,
  criarImpressoraDoAmbiente,
  criarImpressoraTcp,
  StubClienteImpressora,
  type Conectar,
  type EscritorImpressora,
  type TrabalhoImpressao,
} from './impressora'

// Suite deterministica: o encoder e puro e o transporte TCP e injetado (nenhum socket real).

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

const trabalho = (texto: string, extra: Partial<TrabalhoImpressao> = {}): TrabalhoImpressao => ({
  texto,
  largura: 48,
  ...extra,
})

/** Procura a subsequencia `alvo` dentro de `bytes`. */
function contem(bytes: Uint8Array, alvo: number[]): boolean {
  outer: for (let i = 0; i + alvo.length <= bytes.length; i++) {
    for (let j = 0; j < alvo.length; j++) if (bytes[i + j] !== alvo[j]) continue outer
    return true
  }
  return false
}

describe('comandaEscPos (encoder puro)', () => {
  it('inicia a impressora e seleciona a codepage CP860', () => {
    const b = comandaEscPos(trabalho('PEDIDO 1\nlinha'))
    expect([b[0], b[1]]).toEqual([ESC, 0x40]) // ESC @ (init) no inicio
    expect(contem(b, [ESC, 0x74, 0x03])).toBe(true) // ESC t 3 (CP860)
  })

  it('destaca a primeira linha (centro + dobro + negrito) e normaliza depois', () => {
    const b = comandaEscPos(trabalho('CABECALHO\ncorpo'))
    expect(contem(b, [ESC, 0x61, 0x01])).toBe(true) // centralizar
    expect(contem(b, [GS, 0x21, 0x11])).toBe(true) // dobro largura+altura
    expect(contem(b, [ESC, 0x45, 0x01])).toBe(true) // negrito on
    expect(contem(b, [ESC, 0x45, 0x00])).toBe(true) // negrito off
  })

  it('termina em avanco + corte parcial por padrao', () => {
    const b = comandaEscPos(trabalho('x'))
    expect(contem(b, [ESC, 0x64, 0x03])).toBe(true) // ESC d 3 (avanca)
    expect(contem(b, [GS, 0x56, 0x01])).toBe(true) // GS V 1 (corte parcial)
  })

  it('nao corta quando cortar=false e pulsa a gaveta quando abrirGaveta=true', () => {
    const semCorte = comandaEscPos(trabalho('x', { cortar: false }))
    expect(contem(semCorte, [GS, 0x56, 0x01])).toBe(false)
    const comGaveta = comandaEscPos(trabalho('x', { abrirGaveta: true }))
    expect(contem(comGaveta, [ESC, 0x70, 0x00, 0x19, 0xfa])).toBe(true)
  })

  it('codifica acentos pt-BR em CP860 (á=0xA0, ç=0x87, ã=0x84)', () => {
    const b = comandaEscPos(trabalho('áçã'))
    expect(contem(b, [0xa0, 0x87, 0x84, LF])).toBe(true)
  })

  it('dobra para ASCII o que nao esta no CP860 e troca o irreprodutivel por "?"', () => {
    // "ś" (fora do CP860) dobra para "s"; "☃" vira "?".
    const b = comandaEscPos(trabalho('ś☃'))
    expect(contem(b, [0x73, 0x3f, LF])).toBe(true) // 's', '?'
  })

  it('repete o corpo por via (vias=2 => 2 cortes)', () => {
    const b = comandaEscPos(trabalho('x', { vias: 2 }))
    let cortes = 0
    for (let i = 0; i + 2 < b.length; i++) if (b[i] === GS && b[i + 1] === 0x56 && b[i + 2] === 0x01) cortes++
    expect(cortes).toBe(2)
  })
})

describe('criarImpressoraTcp (transporte injetado)', () => {
  it('conecta, escreve os bytes ESC/POS e fecha; responde impresso=true', async () => {
    const escritos: Uint8Array[] = []
    let fechou = false
    const conectar: Conectar = async (host, porta) => {
      expect(host).toBe('10.0.0.5')
      expect(porta).toBe(9100)
      const esc: EscritorImpressora = {
        escrever: async (bytes) => {
          escritos.push(bytes)
        },
        fechar: async () => {
          fechou = true
        },
      }
      return esc
    }
    const cliente = criarImpressoraTcp({ host: '10.0.0.5', conectar })
    const r = await cliente.imprimir(trabalho('PEDIDO 9\nitem'))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.valor).toEqual({ impresso: true, bytes: escritos[0]?.length })
    expect(escritos).toHaveLength(1)
    expect(fechou).toBe(true)
  })

  it('falha de conexao vira erro Transitorio (retentavel), sem lancar', async () => {
    const conectar: Conectar = async () => {
      throw Object.assign(new Error('recusada'), { code: 'ECONNREFUSED' })
    }
    const cliente = criarImpressoraTcp({ host: '10.0.0.9', porta: 9100, conectar })
    const r = await cliente.imprimir(trabalho('x'))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.erro.retentavel).toBe(true)
      expect(r.erro.codigo).toBe('ECONNREFUSED')
    }
  })

  it('erro na escrita ainda fecha o socket e devolve falha', async () => {
    let fechou = false
    const conectar: Conectar = async () => ({
      escrever: async () => {
        throw new Error('sem papel')
      },
      fechar: async () => {
        fechou = true
      },
    })
    const cliente = criarImpressoraTcp({ host: '10.0.0.9', conectar })
    const r = await cliente.imprimir(trabalho('x'))
    expect(r.ok).toBe(false)
    expect(fechou).toBe(true)
  })
})

describe('StubClienteImpressora (no-op)', () => {
  it('nunca envia e responde impresso=false com o tamanho do payload', async () => {
    const r = await new StubClienteImpressora().imprimir(trabalho('PEDIDO 1\nx'))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.valor.impresso).toBe(false)
      expect(r.valor.bytes).toBeGreaterThan(0)
    }
  })
})

describe('criarImpressoraDoAmbiente (gating por ambiente)', () => {
  it('devolve null sem provedor ou sem host (cai no stub)', () => {
    expect(criarImpressoraDoAmbiente({})).toBeNull()
    expect(criarImpressoraDoAmbiente({ API_IMPRESSORA_PROVEDOR: 'escpos_tcp' })).toBeNull()
    expect(criarImpressoraDoAmbiente({ API_IMPRESSORA_HOST: '10.0.0.5' })).toBeNull()
  })

  it('devolve a impressora TCP quando ativada e com host', () => {
    const cliente = criarImpressoraDoAmbiente({
      API_IMPRESSORA_PROVEDOR: 'escpos_tcp',
      API_IMPRESSORA_HOST: '10.0.0.5',
    })
    expect(cliente).not.toBeNull()
    expect(typeof cliente?.imprimir).toBe('function')
  })
})
