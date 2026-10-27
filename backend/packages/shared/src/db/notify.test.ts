// Publicador pg_notify (F5, etapa 7): rejeita PII, loja divergente e payload grande; so
// publica o que o contrato permite. Sem banco real (executor fake).
import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { CANAL_EVENTOS, ErroNotificar, notificar, serializarEvento } from './notify'
import type { Executor } from './index'

const loja = randomUUID()
const ok = () => ({ pedido_id: randomUUID(), loja_id: loja, status: 'novo' })

describe('notificar', () => {
  it('serializa evento valido e chama pg_notify no canal unico', async () => {
    const chamadas: { text: string; values: unknown[] }[] = []
    const exec = {
      query: async (text: string, values: unknown[]) => {
        chamadas.push({ text, values })
        return { rows: [] }
      },
    } as unknown as Executor
    await notificar(exec, { tipo: 'pedido.atualizado', loja_id: loja, payload: ok() })
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0]!.text).toContain('pg_notify')
    expect(chamadas[0]!.values[0]).toBe(CANAL_EVENTOS)
    expect(JSON.parse(chamadas[0]!.values[1] as string).loja_id).toBe(loja)
  })

  it('SEC-024: rejeita payload com PII (chave desconhecida) sem ecoar o valor', () => {
    let erro: unknown
    try {
      serializarEvento({
        tipo: 'pedido.atualizado',
        loja_id: loja,
        payload: { ...ok(), telefone: '+5511999998888' },
      })
    } catch (e) {
      erro = e
    }
    expect(erro).toBeInstanceOf(ErroNotificar)
    expect((erro as Error).message).not.toContain('5511')
  })

  it('rejeita loja_id divergente, loja invalida e tipo desconhecido', () => {
    expect(() =>
      serializarEvento({ tipo: 'pedido.atualizado', loja_id: randomUUID(), payload: ok() }),
    ).toThrow(ErroNotificar)
    expect(() => serializarEvento({ tipo: 'pedido.atualizado', loja_id: 'x', payload: ok() })).toThrow(
      ErroNotificar,
    )
    expect(() => serializarEvento({ tipo: 'x.y' as never, loja_id: loja, payload: ok() })).toThrow(
      ErroNotificar,
    )
  })

  it('o envelope serializado fica abaixo de 8000 bytes', () => {
    const txt = serializarEvento({ tipo: 'pedido.atualizado', loja_id: loja, payload: ok() })
    expect(Buffer.byteLength(txt)).toBeLessThan(8000)
  })
})
