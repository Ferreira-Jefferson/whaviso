import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  criarAppTeste,
  criarUsuario,
  encerrarPools,
  limparUsuario,
  poolSuper,
} from '../../../../test/harness'

const AUTH = { authorization: 'Bearer x' }

// Os pools são de módulo (compartilhados entre describes): encerre UMA vez por arquivo.
afterAll(async () => {
  await encerrarPools()
})

describe('painel/resumo (integração)', () => {
  let uid: string

  beforeAll(async () => {
    uid = await criarUsuario('Painel')
    // receber: sou o cobrador (cobrador_id=uid) -> contas a RECEBER.
    const insReceber = (campos: string) =>
      poolSuper.query(
        `insert into public.avisos (cobrador_id, pix_chave, direcao, criador_papel, status, nome_devedor, telefone_devedor, motivo, valor_centavos, data_combinada)
         values ($1, 'cobrador@pix.com', ${campos})`,
        [uid],
      )
    // pagar invertido: sou o devedor-criador (devedor_profile_id=uid, cobrador_id null) -> contas a PAGAR.
    const insPagar = (campos: string) =>
      poolSuper.query(
        `insert into public.avisos (devedor_profile_id, pix_chave, direcao, criador_papel, status, nome_devedor, telefone_cobrador, nome_cobrador, motivo, valor_centavos, data_combinada)
         values ($1, 'recebe@pix.com', ${campos})`,
        [uid],
      )
    await insReceber(`'receber','cobrador','programado','A','+5511999990001','mensalidade',10000,'2026-06-10'`)
    await insReceber(`'receber','cobrador','aguardando_aceite','B','+5511999990002','mensalidade',5000,'2026-06-11'`)
    await insReceber(`'receber','cobrador','pago','C','+5511999990003','mensalidade',7000,'2026-06-12'`)
    await insPagar(`'pagar','devedor','pago','Eu','+5511999990004','D','mensalidade',3000,'2026-06-13'`)
    await insPagar(`'pagar','devedor','programado','Eu','+5511999990005','E','mensalidade',2000,'2026-06-14'`)
    // Estados novos que DEVEM contar como ativos não pagos no papel correto.
    await insReceber(`'receber','cobrador','informado_pago','F','+5511999990006','mensalidade',1100,'2026-06-15'`)
    await insReceber(`'receber','cobrador','pausado','G','+5511999990007','mensalidade',1200,'2026-06-16'`)
    // Terminais não-pagos: NUNCA entram nos totais a receber/a pagar.
    await insReceber(`'receber','cobrador','cancelado','H','+5511999990008','mensalidade',9900,'2026-06-17'`)
    await insReceber(`'receber','cobrador','expirado','I','+5511999990009','mensalidade',8800,'2026-06-18'`)
  })
  afterAll(async () => {
    await limparUsuario(uid)
  })

  it('agrega por PAPEL em centavos, incluindo estados novos e excluindo terminais', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'GET', url: '/v1/painel/resumo', headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    const b = r.json()
    // a receber = cobrador + ativos não pagos: 10000+5000+1100+1200 = 17300 (NÃO conta cancelado/expirado).
    expect(b.a_receber_centavos).toBe(17300)
    expect(b.a_receber_qtd).toBe(4)
    expect(b.recebido_centavos).toBe(7000)
    expect(b.recebido_qtd).toBe(1)
    expect(b.a_pagar_centavos).toBe(2000)
    expect(b.a_pagar_qtd).toBe(1)
    expect(b.pago_centavos).toBe(3000)
    expect(b.pago_qtd).toBe(1)
    // Legado preservado (billing.useUsoAtivos lê qtd_pendentes + qtd_aguardando_aceite).
    expect(b.pendentes_centavos).toBe(17300)
    expect(b.recebidos_centavos).toBe(7000)
    expect(b.qtd_pendentes).toBe(1) // só 'programado'
    expect(b.qtd_aguardando_aceite).toBe(1)
  })

  it('filtra por intervalo de datas', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'GET', url: '/v1/painel/resumo?de=2026-06-12&ate=2026-06-12', headers: AUTH })
    await app.close()
    expect(r.json().recebido_centavos).toBe(7000)
    expect(r.json().a_receber_centavos).toBe(0)
  })

  it('outro usuário não vê os totais deste (isolamento)', async () => {
    const outro = await criarUsuario('Outro')
    const app = await criarAppTeste(outro)
    const r = await app.inject({ method: 'GET', url: '/v1/painel/resumo', headers: AUTH })
    await app.close()
    await limparUsuario(outro)
    const b = r.json()
    expect(b.a_receber_centavos).toBe(0)
    expect(b.recebido_centavos).toBe(0)
    expect(b.a_pagar_centavos).toBe(0)
  })
})

describe('painel/pendencias (integração)', () => {
  let cobrador: string
  let edicaoCriador: string

  beforeAll(async () => {
    cobrador = await criarUsuario('Cobrador')
    edicaoCriador = await criarUsuario('Criador')
    // Pendência confirmar_pagamento: como cobrador, aviso em informado_pago.
    await poolSuper.query(
      `insert into public.avisos (cobrador_id, pix_chave, direcao, criador_papel, status, nome_devedor, telefone_devedor, motivo, valor_centavos, data_combinada)
       values ($1, 'c@pix.com', 'receber', 'cobrador', 'informado_pago', 'Devedor Z', '+5511999991001', 'aluguel', 4200, '2026-07-01')`,
      [cobrador],
    )
    // Pendência aprovar_edicao: como criador, aviso em aguardando_aprovacao_aviso_editado.
    await poolSuper.query(
      `insert into public.avisos (cobrador_id, pix_chave, direcao, criador_papel, status, nome_devedor, telefone_devedor, motivo, valor_centavos, data_combinada)
       values ($1, 'c@pix.com', 'receber', 'cobrador', 'aguardando_aprovacao_aviso_editado', 'Devedor Y', '+5511999991002', 'curso', 3300, '2026-07-02')`,
      [edicaoCriador],
    )
    // Distrator: programado (NÃO é pendência).
    await poolSuper.query(
      `insert into public.avisos (cobrador_id, pix_chave, direcao, criador_papel, status, nome_devedor, telefone_devedor, motivo, valor_centavos, data_combinada)
       values ($1, 'c@pix.com', 'receber', 'cobrador', 'programado', 'Devedor X', '+5511999991003', 'outro', 100, '2026-07-03')`,
      [cobrador],
    )
  })
  afterAll(async () => {
    await limparUsuario(cobrador)
    await limparUsuario(edicaoCriador)
  })

  it('lista informado_pago do cobrador como confirmar_pagamento', async () => {
    const app = await criarAppTeste(cobrador)
    const r = await app.inject({ method: 'GET', url: '/v1/painel/pendencias', headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    const b = r.json()
    expect(b.total).toBe(1)
    expect(b.itens[0].tipo).toBe('confirmar_pagamento')
    expect(b.itens[0].nome_outra_ponta).toBe('Devedor Z')
    expect(b.itens[0].valor_centavos).toBe(4200)
  })

  it('lista edição a aprovar do criador como aprovar_edicao', async () => {
    const app = await criarAppTeste(edicaoCriador)
    const r = await app.inject({ method: 'GET', url: '/v1/painel/pendencias', headers: AUTH })
    await app.close()
    const b = r.json()
    expect(b.total).toBe(1)
    expect(b.itens[0].tipo).toBe('aprovar_edicao')
  })

  it('não vaza pendências de outro usuário (isolamento)', async () => {
    const estranho = await criarUsuario('Estranho')
    const app = await criarAppTeste(estranho)
    const r = await app.inject({ method: 'GET', url: '/v1/painel/pendencias', headers: AUTH })
    await app.close()
    await limparUsuario(estranho)
    expect(r.json().total).toBe(0)
  })
})
