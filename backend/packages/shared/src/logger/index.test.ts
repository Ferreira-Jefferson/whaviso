// Guarda de segurança (H13.8): telefone, Pix (chave/titular/banco), token, OTP e
// código NUNCA podem aparecer em log, em nenhum nível de aninhamento previsto.
// O pino redige por PATH; aqui confirmamos que os paths declarados cobrem o shape
// real (1 e 2 níveis) e que a recomendação "logar só ids" é o caminho seguro para
// shapes mais profundos (o objeto cru de aviso/perfil nunca deve ser logado).
import { describe, expect, it } from 'vitest'
import { criarLogger } from './index'

// Usa o logger REAL (mesma config de redaction) escrevendo num buffer.
function loggerCapturando() {
  const buf: string[] = []
  const log = criarLogger('teste', 'info', { write: (s: string) => buf.push(s) })
  return { log, saida: () => buf.join('') }
}

const SEGREDOS = ['+5511999998888', 'ana@pix.com', 'Ana Silva', 'Banco X', 'tok_secreto', '123456']

function nenhumSegredoVazou(saida: string): void {
  for (const s of SEGREDOS) {
    expect(saida, `vazou "${s}" no log`).not.toContain(s)
  }
}

describe('redaction do logger (H13.8)', () => {
  it('redige campos sensíveis no nível raiz', () => {
    const { log, saida } = loggerCapturando()
    log.info({
      telefone: '+5511999998888',
      telefone_cobrador: '+5511999998888',
      pix_chave: 'ana@pix.com',
      pix_titular: 'Ana Silva',
      pix_banco: 'Banco X',
      token: 'tok_secreto',
      otp: '123456',
      codigo: '123456',
    })
    const s = saida()
    nenhumSegredoVazou(s)
    expect(s).toContain('[oculto]')
  })

  it('redige campos sensíveis aninhados em 1 e 2 níveis', () => {
    const { log, saida } = loggerCapturando()
    log.info({
      perfil: { telefone: '+5511999998888', pix_titular: 'Ana Silva' }, // 1 nível
      aviso: { dados: { telefone_cobrador: '+5511999998888', pix_chave: 'ana@pix.com', token: 'tok_secreto' } }, // 2 níveis
    })
    nenhumSegredoVazou(saida())
  })

  it('o id não-sensível continua visível (logar só ids é seguro)', () => {
    const { log, saida } = loggerCapturando()
    log.info({ aviso_id: 'abc-123', evento: 'optout' })
    const s = saida()
    expect(s).toContain('abc-123')
    expect(s).toContain('optout')
  })
})
