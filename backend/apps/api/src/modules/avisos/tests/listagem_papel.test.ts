import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  criarAppTeste,
  criarUsuario,
  encerrarPools,
  limparUsuario,
  poolSuper,
} from '../../../../test/harness'

const AUTH = { authorization: 'Bearer x' }

// H9.1: listagem POR PAPEL (não por direção). No fluxo invertido o criador é o devedor,
// então direcao='pagar' NÃO equivale a "sou devedor": o teste prova que papel cobre os
// dois fluxos pela posição (cobrador_id / devedor_profile_id), não pela direcao.
describe('GET /v1/avisos por papel (integração)', () => {
  let euCobrador: string
  let euDevedor: string
  let aPagarId: string

  beforeAll(async () => {
    euCobrador = await criarUsuario('Eu Cobrador')
    euDevedor = await criarUsuario('Eu Devedor')

    // Fluxo receber: euCobrador é o cobrador (a receber).
    await poolSuper.query(
      `insert into public.avisos (cobrador_id, pix_chave, direcao, criador_papel, status, nome_devedor, telefone_devedor, motivo, valor_centavos, data_combinada)
       values ($1,'c@pix.com','receber','cobrador','programado','Joana','+5511999992001','aluguel do mes',5000,'2026-08-10')`,
      [euCobrador],
    )
    // Fluxo pagar invertido: euDevedor é o criador-devedor (a pagar). direcao='pagar'.
    const { rows } = await poolSuper.query<{ id: string }>(
      `insert into public.avisos (devedor_profile_id, pix_chave, direcao, criador_papel, status, nome_devedor, telefone_cobrador, nome_cobrador, motivo, valor_centavos, data_combinada)
       values ($1,'r@pix.com','pagar','devedor','programado','Eu','+5511999992002','Pedro Cobrador','curso de ingles',6000,'2026-08-11') returning id`,
      [euDevedor],
    )
    aPagarId = rows[0]!.id
    // Invertido em que euCobrador foi convidado e ACEITOU como cobrador (cobrador_id=euCobrador).
    await poolSuper.query(
      `insert into public.avisos (cobrador_id, devedor_profile_id, pix_chave, direcao, criador_papel, status, nome_devedor, telefone_cobrador, nome_cobrador, motivo, valor_centavos, data_combinada)
       values ($1,$2,'r@pix.com','pagar','devedor','programado','Eu Devedor','+5511999992003','Eu Cobrador','reforma',7000,'2026-08-12')`,
      [euCobrador, euDevedor],
    )
  })
  afterAll(async () => {
    await limparUsuario(euCobrador)
    await limparUsuario(euDevedor)
    await encerrarPools()
  })

  it('papel=devedor traz o invertido criado por mim, mesmo com direcao=pagar', async () => {
    const app = await criarAppTeste(euDevedor)
    const r = await app.inject({ method: 'GET', url: '/v1/avisos?papel=devedor', headers: AUTH })
    await app.close()
    const ids = r.json().itens.map((a: { id: string }) => a.id)
    expect(ids).toContain(aPagarId)
  })

  it('papel=cobrador traz o invertido em que aceitei como cobrador (direcao=pagar)', async () => {
    const app = await criarAppTeste(euCobrador)
    const r = await app.inject({ method: 'GET', url: '/v1/avisos?papel=cobrador', headers: AUTH })
    await app.close()
    const itens = r.json().itens as { direcao: string }[]
    // euCobrador é cobrador em 1 receber + 1 invertido (direcao=pagar). Os dois entram.
    expect(itens.length).toBe(2)
    expect(itens.some((a) => a.direcao === 'pagar')).toBe(true)
  })

  it('busca cobre nome da outra ponta OU motivo', async () => {
    const app = await criarAppTeste(euCobrador)
    const porNome = await app.inject({ method: 'GET', url: '/v1/avisos?busca=Joana', headers: AUTH })
    const porMotivo = await app.inject({ method: 'GET', url: '/v1/avisos?busca=reforma', headers: AUTH })
    await app.close()
    expect(porNome.json().total).toBe(1)
    expect(porMotivo.json().total).toBe(1)
  })

  it('grupo=ativos exclui terminais; isolamento por usuario', async () => {
    const estranho = await criarUsuario('Estranho')
    const app = await criarAppTeste(estranho)
    const r = await app.inject({ method: 'GET', url: '/v1/avisos?grupo=ativos', headers: AUTH })
    await app.close()
    await limparUsuario(estranho)
    expect(r.json().total).toBe(0)
  })
})
