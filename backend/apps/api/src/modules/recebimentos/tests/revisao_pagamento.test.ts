import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  aceitarAvisoDireto,
  criarAppTeste,
  criarUsuario,
  definirPlano,
  encerrarPools,
  limparAvisos,
  limparUsuario,
  poolSuper,
} from '../../../../test/harness'

const AUTH_COBRADOR = { authorization: 'Bearer cobrador' }
const AUTH_DEVEDOR = { authorization: 'Bearer devedor' }

function corpo(over: Record<string, unknown> = {}) {
  return {
    direcao: 'receber',
    nome_devedor: 'Maria',
    telefone_devedor: '+5511999998888',
    motivo: 'mensalidade',
    itens: [{ descricao: 'Item', qtd: 1, valor_unit_centavos: 9900 }],
    data_combinada: '2026-12-15',
    pix_chave: 'maria@pix.com',
    pix_titular: 'Maria Silva',
    pix_banco: 'Banco Exemplo',
    ...over,
  }
}

// Estado intermediário "informado_pago": o devedor avisa que pagou (não vai direto a
// 'pago'); fica em revisão até o cobrador confirmar (→ pago) ou rejeitar (→ programado).
// Como é estado NÃO-terminal, os envios (lembretes) seguem agendados.
describe('recebimentos: revisão de pagamento (informado_pago)', () => {
  let cobrador: string
  let devedor: string

  async function criarAceito(): Promise<string> {
    const appC = await criarAppTeste(cobrador)
    const criado = await appC.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH_COBRADOR, payload: corpo() })
    await appC.close()
    const body = criado.json()
    await aceitarAvisoDireto(body.aviso.id, devedor) // E5: site de aceite removido
    return body.aviso.id
  }

  async function devedorInforma(id: string): Promise<void> {
    const app = await criarAppTeste(devedor)
    await app.inject({ method: 'POST', url: `/v1/avisos/${id}/marcar-pago-devedor`, headers: AUTH_DEVEDOR })
    await app.close()
  }

  beforeAll(async () => {
    cobrador = await criarUsuario('Cobrador Revisao')
    await definirPlano(cobrador, 'profissional')
    devedor = await criarUsuario('Devedor Revisao')
  })
  beforeEach(async () => {
    await limparAvisos(cobrador)
  })
  afterAll(async () => {
    await limparUsuario(cobrador)
    await limparUsuario(devedor)
    await encerrarPools()
  })

  it('devedor informa: programado → informado_pago; lembretes seguem; evento registrado', async () => {
    const id = await criarAceito()
    const app = await criarAppTeste(devedor)
    const r = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/marcar-pago-devedor`, headers: AUTH_DEVEDOR })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().status).toBe('informado_pago')

    // Estado não-terminal: o trigger NÃO cancela os envios (lembretes continuam).
    const ativos = await poolSuper.query(
      `select count(*)::int as n from public.envios where aviso_id=$1 and status='agendado'`, [id])
    expect(ativos.rows[0].n).toBe(4)
    const ev = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='ja_paguei_devedor'`, [id])
    expect(ev.rows[0].n).toBe(1)
    // Enfileirou o aviso "pagamento informado" ao cobrador (outbox; o zap envia o
    // WhatsApp). Filtra pelo tipo: o aceite anterior também enfileira 'combinado_aceito'.
    const notif = await poolSuper.query(
      `select count(*)::int as n from public.notificacoes_cobrador
       where aviso_id=$1 and status='agendado' and tipo='pagamento_informado'`, [id])
    expect(notif.rows[0].n).toBe(1)
  })

  it('cobrador confirma a partir de informado_pago → pago; cancela os 4 envios', async () => {
    const id = await criarAceito()
    await devedorInforma(id)
    const app = await criarAppTeste(cobrador)
    const r = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/confirmar-recebimento`, headers: AUTH_COBRADOR })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().status).toBe('pago')

    const cancelados = await poolSuper.query(
      `select count(*)::int as n from public.envios where aviso_id=$1 and status='cancelado'`, [id])
    expect(cancelados.rows[0].n).toBe(4)
    const ev = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='confirmado_cobrador'`, [id])
    expect(ev.rows[0].n).toBe(1)
  })

  it('cobrador rejeita: informado_pago → programado; lembretes seguem; evento rejeitado_cobrador', async () => {
    const id = await criarAceito()
    await devedorInforma(id)
    const app = await criarAppTeste(cobrador)
    const r = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/rejeitar-pagamento`, headers: AUTH_COBRADOR })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().status).toBe('programado')

    const ativos = await poolSuper.query(
      `select count(*)::int as n from public.envios where aviso_id=$1 and status='agendado'`, [id])
    expect(ativos.rows[0].n).toBe(4)
    const ev = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='rejeitado_cobrador' and ator='cobrador'`, [id])
    expect(ev.rows[0].n).toBe(1)
  })

  it('só o cobrador dono rejeita (devedor → 403)', async () => {
    const id = await criarAceito()
    await devedorInforma(id)
    const app = await criarAppTeste(devedor)
    const r = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/rejeitar-pagamento`, headers: AUTH_DEVEDOR })
    await app.close()
    expect(r.statusCode).toBe(403)
  })

  it('rejeitar quando já programado → 200 idempotente (sem novo evento)', async () => {
    const id = await criarAceito()
    const app = await criarAppTeste(cobrador)
    const r = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/rejeitar-pagamento`, headers: AUTH_COBRADOR })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().status).toBe('programado')
    const ev = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='rejeitado_cobrador'`, [id])
    expect(ev.rows[0].n).toBe(0)
  })
})
