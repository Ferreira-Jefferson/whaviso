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

describe('recebimentos: encerrar-lembretes (opt-out do devedor logado)', () => {
  let cobrador: string
  let devedor: string

  // Cria aviso 'receber' e o aceita como devedor → 'programado', 4 envios agendados.
  // O aceite por site saiu (E5); ativamos direto no banco (espelho do aceite WhatsApp).
  async function criarAceito(): Promise<string> {
    const appC = await criarAppTeste(cobrador)
    const criado = await appC.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH_COBRADOR, payload: corpo() })
    await appC.close()
    const body = criado.json()
    await aceitarAvisoDireto(body.aviso.id, devedor)
    return body.aviso.id
  }

  beforeAll(async () => {
    cobrador = await criarUsuario('Cobrador Optout')
    await definirPlano(cobrador, 'profissional')
    devedor = await criarUsuario('Devedor Optout')
  })
  beforeEach(async () => {
    await limparAvisos(cobrador)
  })
  afterAll(async () => {
    await limparUsuario(cobrador)
    await limparUsuario(devedor)
    await encerrarPools()
  })

  it('sem token → 401', async () => {
    const id = await criarAceito()
    const app = await criarAppTeste(devedor)
    const r = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/encerrar-lembretes` })
    await app.close()
    expect(r.statusCode).toBe(401)
  })

  it('só o devedor vinculado pode (cobrador → 403)', async () => {
    const id = await criarAceito()
    const app = await criarAppTeste(cobrador)
    const r = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/encerrar-lembretes`, headers: AUTH_COBRADOR })
    await app.close()
    expect(r.statusCode).toBe(403)
  })

  it('devedor encerra: programado → cancelado e cancela os 4 envios', async () => {
    const id = await criarAceito()
    const app = await criarAppTeste(devedor)
    const r = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/encerrar-lembretes`, headers: AUTH_DEVEDOR })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().status).toBe('cancelado')

    const envios = await poolSuper.query(
      `select count(*)::int as n from public.envios where aviso_id=$1 and status='cancelado'`, [id])
    expect(envios.rows[0].n).toBe(4)
    const ev = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='optout' and ator='devedor'`, [id])
    expect(ev.rows[0].n).toBe(1)
  })

  it('idempotente: 2ª chamada devolve 200 com o estado terminal', async () => {
    const id = await criarAceito()
    const app = await criarAppTeste(devedor)
    const r1 = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/encerrar-lembretes`, headers: AUTH_DEVEDOR })
    const r2 = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/encerrar-lembretes`, headers: AUTH_DEVEDOR })
    await app.close()
    expect(r1.json().status).toBe('cancelado')
    expect(r2.statusCode).toBe(200)
    expect(r2.json().status).toBe('cancelado')
    // não duplica o evento de auditoria
    const ev = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='optout'`, [id])
    expect(ev.rows[0].n).toBe(1)
  })
})
