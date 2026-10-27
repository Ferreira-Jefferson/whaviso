// Unidade do hub, permissoes e parsers do realtime (F5, etapa 7). Sem banco.
import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { HubRealtime, LimiteExcedido, lerUltimoId, type MensagemHub } from './hub'
import { podeVerEvento } from './permissoes'
import { formatarMensagem, lerExpDoBearer } from './sse'

const lojaA = randomUUID()
const lojaB = randomUUID()

function bruto(loja: string, tipo = 'pedido.atualizado', extra: Record<string, unknown> = {}): string {
  const payload =
    tipo === 'pedido.atualizado'
      ? { pedido_id: randomUUID(), loja_id: loja, status: 'novo' }
      : { conversa_id: randomUUID(), loja_id: loja, direcao: 'entrada', autor: 'cliente' }
  return JSON.stringify({
    tipo,
    loja_id: loja,
    ocorrido_em: new Date().toISOString(),
    payload: { ...payload, ...extra },
  })
}

function assinante(hub: HubRealtime, lojas: string[], user = randomUUID(), papel: 'dono' | 'atendente' = 'dono') {
  const recebidas: MensagemHub[] = []
  const handle = hub.assinar({
    user_id: user,
    escopo: {
      tipo: 'loja',
      loja_ids: lojas,
      papel_por_loja: Object.fromEntries(lojas.map((l) => [l, papel])),
    },
    entregar: (m) => recebidas.push(m),
  })
  return { recebidas, handle, user }
}

describe('HubRealtime', () => {
  it('roteia por loja: so quem tem a loja no escopo recebe (SEC-001)', () => {
    const hub = new HubRealtime()
    const a = assinante(hub, [lojaA])
    const b = assinante(hub, [lojaB])
    expect(hub.publicar(bruto(lojaA))).toBe(true)
    expect(a.recebidas).toHaveLength(1)
    expect(b.recebidas).toHaveLength(0)
  })

  it('descarta evento invalido, sem loja_id ou com loja divergente', () => {
    const hub = new HubRealtime()
    const a = assinante(hub, [lojaA])
    expect(hub.publicar('nao e json')).toBe(false)
    expect(hub.publicar(JSON.stringify({ tipo: 'pedido.atualizado', payload: {} }))).toBe(false)
    expect(hub.publicar(bruto(lojaA, 'pedido.atualizado', { loja_id: lojaB }))).toBe(false)
    expect(hub.publicar(bruto(lojaA, 'pedido.atualizado', { telefone: '+5511999998888' }))).toBe(false)
    expect(hub.publicar(bruto(lojaA, 'tipo.inexistente'))).toBe(false)
    expect(a.recebidas).toHaveLength(0)
  })

  it('ids monotonicos e remocao ao cancelar (sem vazamento)', () => {
    const hub = new HubRealtime({ epoca: 'ep' })
    const a = assinante(hub, [lojaA])
    hub.publicar(bruto(lojaA))
    hub.publicar(bruto(lojaA))
    expect(a.recebidas.map((m) => (m.tipo === 'evento' ? m.id : ''))).toEqual(['ep-1', 'ep-2'])
    expect(hub.total()).toBe(1)
    a.handle.cancelar()
    a.handle.cancelar()
    expect(hub.total()).toBe(0)
    hub.publicar(bruto(lojaA))
    expect(a.recebidas).toHaveLength(2)
  })

  it('SEC-101: limites por usuario e por loja', () => {
    const hub = new HubRealtime({ limitePorUsuario: 2, limitePorLoja: 3 })
    const u = randomUUID()
    assinante(hub, [lojaA], u)
    assinante(hub, [lojaA], u)
    expect(() => assinante(hub, [lojaA], u)).toThrow(LimiteExcedido)
    assinante(hub, [lojaA])
    expect(() => assinante(hub, [lojaA])).toThrow(LimiteExcedido)
    // cancelar libera a vaga
    const outro = assinante(hub, [lojaB], randomUUID())
    outro.handle.cancelar()
    expect(() => assinante(hub, [lojaB])).not.toThrow()
  })

  it('SEC-003: escopo que nao e de loja nao assina', () => {
    const hub = new HubRealtime()
    expect(() =>
      hub.assinar({
        user_id: randomUUID(),
        escopo: { tipo: 'operador' as never, loja_ids: [lojaA], papel_por_loja: {} },
        entregar: () => {},
      }),
    ).toThrow()
  })

  it('retoma por Last-Event-ID; id antigo/de outra epoca/malformado vira resync', () => {
    const hub = new HubRealtime({ epoca: 'ep', tamanhoBuffer: 2 })
    for (let i = 0; i < 4; i++) hub.publicar(bruto(lojaA))
    // buffer guarda seq 3 e 4
    const ok = assinante(hub, [lojaA])
    ok.handle.retomar('ep-2')
    expect(ok.recebidas.map((m) => (m.tipo === 'evento' ? m.id : m.tipo))).toEqual(['ep-3', 'ep-4'])
    for (const id of ['ep-1', 'outra-3', 'lixo!', 'ep-99']) {
      const x = assinante(hub, [lojaA])
      x.handle.retomar(id)
      expect(x.recebidas).toEqual([{ tipo: 'resync', motivo: 'id_antigo' }])
    }
    const sem = assinante(hub, [lojaA])
    sem.handle.retomar(null)
    expect(sem.recebidas).toHaveLength(0)
  })

  it('retomada respeita o escopo: nao reenvia evento de loja alheia', () => {
    const hub = new HubRealtime({ epoca: 'ep' })
    hub.publicar(bruto(lojaB))
    hub.publicar(bruto(lojaA))
    const a = assinante(hub, [lojaA])
    a.handle.retomar('ep-0')
    expect(a.recebidas).toHaveLength(1)
  })

  it('ressincronizar avisa todos; encerrar manda fim e solta tudo', () => {
    const hub = new HubRealtime()
    const a = assinante(hub, [lojaA])
    const b = assinante(hub, [lojaB])
    hub.ressincronizar()
    expect(a.recebidas).toEqual([{ tipo: 'resync', motivo: 'reconectou' }])
    hub.encerrar()
    expect(b.recebidas.at(-1)).toEqual({ tipo: 'fim', motivo: 'encerrando' })
    expect(hub.total()).toBe(0)
  })
})

describe('permissoes por evento', () => {
  const escopo = { loja_ids: [lojaA], papel_por_loja: { [lojaA]: 'atendente' as const } }
  it('papel permite tipo, loja fora do escopo e tipo desconhecido negam', () => {
    expect(podeVerEvento(escopo, lojaA, 'pedido.atualizado')).toBe(true)
    expect(podeVerEvento(escopo, lojaB, 'pedido.atualizado')).toBe(false)
    expect(podeVerEvento(escopo, lojaA, 'cobranca.x')).toBe(false)
    expect(podeVerEvento({ loja_ids: [lojaA], papel_por_loja: {} }, lojaA, 'pedido.atualizado')).toBe(false)
  })
})

describe('parsers e formato', () => {
  it('lerUltimoId', () => {
    expect(lerUltimoId('abc1-42')).toEqual({ epoca: 'abc1', seq: 42 })
    expect(lerUltimoId('')).toBeNull()
    expect(lerUltimoId(undefined)).toBeNull()
    expect(lerUltimoId('a-b')).toBeNull()
    expect(lerUltimoId('x'.repeat(50) + '-1')).toBeNull()
  })
  it('lerExpDoBearer', () => {
    const tok = (p: object) => `Bearer h.${Buffer.from(JSON.stringify(p)).toString('base64url')}.s`
    expect(lerExpDoBearer(tok({ exp: 123 }))).toBe(123)
    expect(lerExpDoBearer(tok({}))).toBeNull()
    expect(lerExpDoBearer('Bearer lixo')).toBeNull()
    expect(lerExpDoBearer(undefined)).toBeNull()
  })
  it('formato SSE com id/event/data', () => {
    const evento = JSON.parse(bruto(lojaA))
    const txt = formatarMensagem({ tipo: 'evento', id: 'e-1', evento })
    expect(txt.startsWith('id: e-1\nevent: pedido.atualizado\ndata: {')).toBe(true)
    expect(txt.endsWith('\n\n')).toBe(true)
    expect(formatarMensagem({ tipo: 'resync', motivo: 'reconectou' })).toBe(
      'event: resync\ndata: {"motivo":"reconectou"}\n\n',
    )
  })
})
