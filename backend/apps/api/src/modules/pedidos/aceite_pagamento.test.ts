// Integracao: forma de pagamento + troco no pedido (G9) e guarda de aceite por pausa/capacidade
// (G7) na costura de criacao do pedido (modulo pedidos).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { poolSuper } from '../../../test/db'
import { chamar, corpoPadrao, encerrar, montarMundo, online, type Mundo } from './tests/harness'

const d = online ? describe : describe.skip
if (!online) console.warn('[pedidos/aceite] banco inacessivel: integracao PULADA.')

d('forma de pagamento, troco e guarda de aceite', () => {
  let m: Mundo
  beforeAll(async () => { m = await montarMundo() })
  afterAll(async () => { if (m) await encerrar(m) })

  const criar = (extra: Record<string, unknown>) =>
    chamar(m, m.dono, m.A.loja, 'POST', '/', corpoPadrao(m.A, extra))
  // Helpers de estado da loja: SQL fixo e parametrizado (SEC-080), nunca interpolado.
  const limparEstadoLoja = () =>
    poolSuper.query(
      'update public.lojas set pausada = false, pausada_motivo = null, pausada_ate = null, capacidade_por_janela = null where id = $1',
      [m.A.loja],
    )
  const pausar = (ate: 'futuro' | 'passado' | null) =>
    poolSuper.query(
      `update public.lojas set pausada = true,
         pausada_ate = case $2
           when 'futuro' then now() + interval '1 hour'
           when 'passado' then now() - interval '1 hour'
           else null end
       where id = $1`,
      [m.A.loja, ate],
    )
  const setCapacidade = (teto: number, minutos: number) =>
    poolSuper.query(
      'update public.lojas set capacidade_por_janela = $2, capacidade_janela_minutos = $3 where id = $1',
      [m.A.loja, teto, minutos],
    )

  describe('G9: forma de pagamento + troco', () => {
    it('persiste dinheiro com troco e carimba na comanda', async () => {
      const r = await criar({ forma_pagamento: 'dinheiro', troco_para_centavos: 10000 })
      expect(r.status, JSON.stringify(r.corpo)).toBe(201)
      expect(r.corpo.forma_pagamento).toBe('dinheiro')
      expect(r.corpo.troco_para_centavos).toBe(10000)

      const imp = await chamar(m, m.dono, m.A.loja, 'GET', `/${r.corpo.id}/impressao?formato=texto&largura=48`)
      expect(imp.status).toBe(200)
      expect(imp.corpo.conteudo).toContain('Pagamento: Dinheiro')
      expect(imp.corpo.conteudo).toContain('Troco para')
      // total do corpoPadrao = 6100; troco a devolver = 10000 - 6100 = 3900 -> R$ 39,00
      expect(imp.corpo.conteudo).toMatch(/Troco\s+R\$\s?39,00/)
    })

    it('pix sem troco: forma persiste, troco fica nulo', async () => {
      const r = await criar({ forma_pagamento: 'pix' })
      expect(r.status).toBe(201)
      expect(r.corpo.forma_pagamento).toBe('pix')
      expect(r.corpo.troco_para_centavos).toBeNull()
      const imp = await chamar(m, m.dono, m.A.loja, 'GET', `/${r.corpo.id}/impressao?formato=texto&largura=48`)
      expect(imp.corpo.conteudo).toContain('Pagamento: Pix')
      expect(imp.corpo.conteudo).not.toContain('Troco para')
    })

    it('troco sem dinheiro e recusado (422 troco_so_dinheiro)', async () => {
      const r = await criar({ forma_pagamento: 'credito', troco_para_centavos: 5000 })
      expect(r.status).toBe(422)
      expect(r.corpo.error.code).toBe('troco_so_dinheiro')
    })

    it('sem forma de pagamento: pedido valido, sem secao de pagamento na comanda', async () => {
      const r = await criar({})
      expect(r.status).toBe(201)
      expect(r.corpo.forma_pagamento).toBeNull()
      const imp = await chamar(m, m.dono, m.A.loja, 'GET', `/${r.corpo.id}/impressao?formato=texto&largura=48`)
      expect(imp.corpo.conteudo).not.toContain('Pagamento:')
    })
  })

  describe('G7: guarda de aceite (pausa e capacidade)', () => {
    afterAll(async () => { await limparEstadoLoja() })

    it('loja pausada agora recusa pedido novo (409 loja_pausada)', async () => {
      await pausar(null)
      const r = await criar({})
      expect(r.status).toBe(409)
      expect(r.corpo.error.code).toBe('loja_pausada')
    })

    it('pausa com prazo ja vencido nao bloqueia', async () => {
      await pausar('passado')
      const r = await criar({})
      expect(r.status, JSON.stringify(r.corpo)).toBe(201)
      await limparEstadoLoja()
    })

    it('capacidade da janela atingida recusa o proximo (409 capacidade_excedida)', async () => {
      const { rows } = await poolSuper.query<{ n: string }>(
        `select count(*)::text as n from public.pedidos where loja_id = $1 and status <> 'rascunho'
           and criado_em > now() - interval '60 minutes'`,
        [m.A.loja],
      )
      const atual = Number(rows[0]!.n)
      // Teto = atual + 1: o proximo ainda cabe, o seguinte estoura.
      await setCapacidade(atual + 1, 60)
      const ok = await criar({})
      expect(ok.status, JSON.stringify(ok.corpo)).toBe(201)
      const cheio = await criar({})
      expect(cheio.status).toBe(409)
      expect(cheio.corpo.error.code).toBe('capacidade_excedida')
    })
  })
})
