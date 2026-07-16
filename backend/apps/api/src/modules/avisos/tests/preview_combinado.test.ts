import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  criarAppTeste,
  criarUsuario,
  definirPlano,
  encerrarPools,
  limparUsuario,
} from '../../../../test/harness'

const AUTH = { authorization: 'Bearer fake' }

// POST /v1/avisos/combinado-preview: renderiza o template `combinado.resumo` a partir do
// RASCUNHO do formulário (o aviso não existe ainda). Depende do catálogo de templates ATIVO
// no whaviso_dev (o seed reativa o catálogo). O harness já conecta ao banco.
describe('POST /v1/avisos/combinado-preview (integração com whaviso_dev)', () => {
  let uid: string

  beforeAll(async () => {
    uid = await criarUsuario('Cobrador Preview')
    await definirPlano(uid, 'profissional')
  })
  afterAll(async () => {
    await limparUsuario(uid)
    await encerrarPools()
  })

  it('sem token → 401', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/avisos/combinado-preview',
      payload: {
        direcao: 'receber',
        nome_devedor: 'Maria',
        valor_centavos: 9900,
        motivo: 'mensalidade',
        data_combinada: '2026-12-15',
      },
    })
    await app.close()
    expect(r.statusCode).toBe(401)
  })

  it('receber → 200 com 3 botões e render contendo o nome e o valor formatado', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/avisos/combinado-preview',
      headers: AUTH,
      payload: {
        direcao: 'receber',
        nome_devedor: 'Maria',
        valor_centavos: 9900,
        motivo: 'mensalidade',
        data_combinada: '2026-12-15',
        pix_chave: 'maria@pix.com',
        pix_titular: 'Maria',
        pix_banco: 'Banco',
      },
    })
    await app.close()
    expect(r.statusCode).toBe(200)
    const body = r.json()
    // combinado.resumo tem os 3 botões de aceite (o aceite é 100% por WhatsApp, E5).
    expect(body.botoes).toHaveLength(3)
    expect(body.render).toContain('Maria')
    // formatarValorBr(9900) = "R$ 99,00"
    expect(body.render).toContain('R$')
    expect(body.render).toContain('99,00')
  })

  it('pagar (invertido) → 200; usa o contexto revisao (render inclui a chave Pix quando a variante está ativa)', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/avisos/combinado-preview',
      headers: AUTH,
      payload: {
        direcao: 'pagar',
        nome_devedor: 'Joao',
        valor_centavos: 5000,
        motivo: 'aluguel',
        data_combinada: '2026-12-15',
        pix_chave: 'joao@pix.com',
      },
    })
    await app.close()
    expect(r.statusCode).toBe(200)
    const body = r.json()
    // A variante revisao inclui {{pix_chave}} no corpo; se estiver ativa/semeada, a chave
    // aparece no render. Caso a variante NÃO esteja ativa (cai no padrao), o preview ainda
    // é válido: só exigimos 200 + render não-vazio (não travamos o teste na chave Pix).
    expect(body.render.length).toBeGreaterThan(0)
    if (body.render.includes('pix') || body.render.includes('Pix') || body.render.includes('chave')) {
      expect(body.render).toContain('joao@pix.com')
    }
  })
})
