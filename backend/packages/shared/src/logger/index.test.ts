// SEC-024: dado sensivel NUNCA aparece em log, em qualquer profundidade, nem em err/req.
import { describe, expect, it } from 'vitest'
import { criarLogger } from './index'

function loggerCapturando() {
  const buf: string[] = []
  const log = criarLogger('teste', 'trace', { write: (s: string) => buf.push(s) })
  return { log, saida: () => buf.join('') }
}

const SEGREDOS = ['+5511999998888', 'ana@pix.com', 'Ana Silva', 'tok_secreto', 'Bearer abc.def.ghi', 'sessao=xyz', 'hash_do_segredo', 'senha-123', 'chave-mestra', 'cifra-b64']

function nenhumSegredoVazou(saida: string): void {
  for (const s of SEGREDOS) expect(saida, `vazou "${s}"`).not.toContain(s)
}

describe('redaction do logger (SEC-024)', () => {
  it('redige campos sensiveis na raiz', () => {
    const { log, saida } = loggerCapturando()
    log.info({
      telefone: '+5511999998888', numero: '+5511999998888', pix: 'ana@pix.com', titular: 'Ana Silva',
      token: 'tok_secreto', authorization: 'Bearer abc.def.ghi', cookie: 'sessao=xyz',
      senha: 'senha-123', chave: 'chave-mestra', chave_cifrada: 'cifra-b64', token_hash: 'hash_do_segredo',
    })
    nenhumSegredoVazou(saida())
    expect(saida()).toContain('[oculto]')
  })

  it('redige aninhado em profundidade arbitraria (arrays inclusive)', () => {
    const { log, saida } = loggerCapturando()
    log.info({
      a: { b: { c: { d: { e: { telefone: '+5511999998888', itens: [{ pix: 'ana@pix.com' }] } } } } },
      lista: [[{ token: 'tok_secreto' }], { x: { senha: 'senha-123' } }],
    })
    nenhumSegredoVazou(saida())
  })

  it('redige em err.config e req.headers', () => {
    const { log, saida } = loggerCapturando()
    const erro = Object.assign(new Error('falha http'), {
      config: { headers: { authorization: 'Bearer abc.def.ghi', cookie: 'sessao=xyz' }, data: { chave: 'chave-mestra' } },
    })
    log.error({ err: erro }, 'chamada externa falhou')
    log.error({ outro: erro })
    log.info({
      req: { method: 'GET', url: '/x', headers: { authorization: 'Bearer abc.def.ghi', cookie: 'sessao=xyz' } },
    })
    nenhumSegredoVazou(saida())
    expect(saida()).toContain('falha http')
  })

  it('objeto circular nao quebra o log', () => {
    const { log, saida } = loggerCapturando()
    const o: Record<string, unknown> = { telefone: '+5511999998888' }
    o.self = o
    log.info(o)
    nenhumSegredoVazou(saida())
  })

  it('ids nao sensiveis continuam visiveis', () => {
    const { log, saida } = loggerCapturando()
    log.info({ pedido_id: 'abc-123', evento: 'novo' })
    expect(saida()).toContain('abc-123')
  })
})
