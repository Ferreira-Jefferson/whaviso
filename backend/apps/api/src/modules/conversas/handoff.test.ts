// Integracao (Postgres LOCAL whaviso_dev_conversas): handoff manual (assumir/devolver),
// transicoes invalidas (422), isolamento por loja e emissao do evento realtime.
import { describe, it, expect } from 'vitest'
import { bancoAcessivel, poolSuper, novoCenario, limpar } from '../../../test/db'
import { criarHarness, bearer } from './tests/harness'
import { criarCliente, criarConversa, criarMundo } from './tests/fixtures'

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[conversas] banco inacessivel: testes de integracao PULADOS.')

d('conversas: handoff manual (assumir e devolver)', () => {
  const h = criarHarness()

  it('assumir: ia->humano, grava quem assumiu + humano_desde, audita e emite conversa.handoff(humano)', async () => {
    const m = await h.novo()
    const c = await criarConversa(m, (await criarCliente(m.lojaId, 'Ana')).id, { status: 'ia' })
    await h.montar()
    const r = await h.app.inject({ method: 'POST', url: `/v1/conversas/${c}/assumir`, headers: bearer(m.userId) })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ id: c, status: 'humano' })

    const { rows } = await poolSuper.query(
      'select status, atendido_por_membro_id, humano_desde from public.conversas where id=$1',
      [c],
    )
    expect(rows[0].status).toBe('humano')
    expect(rows[0].atendido_por_membro_id).not.toBeNull()
    expect(rows[0].humano_desde).not.toBeNull()

    const { rows: aud } = await poolSuper.query(
      `select detalhes from public.eventos where entidade_id=$1 and tipo='conversa.handoff_assumido'`,
      [c],
    )
    expect(aud).toHaveLength(1)
    expect(aud[0].detalhes).toEqual({ de: 'ia', para: 'humano' })

    await h.esperar(() => h.eventos.length > 0)
    expect(h.eventos[0]).toMatchObject({
      tipo: 'conversa.handoff',
      loja_id: m.lojaId,
      payload: { conversa_id: c, loja_id: m.lojaId, status: 'humano' },
    })
  })

  it('devolver: humano->ia, limpa quem atendia + humano_desde, audita e emite conversa.handoff(ia)', async () => {
    const m = await h.novo()
    const c = await criarConversa(m, (await criarCliente(m.lojaId, 'Bia')).id, { status: 'humano' })
    await poolSuper.query('update public.conversas set humano_desde=now() where id=$1', [c])
    await h.montar()
    const r = await h.app.inject({ method: 'POST', url: `/v1/conversas/${c}/devolver`, headers: bearer(m.userId) })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ id: c, status: 'ia' })

    const { rows } = await poolSuper.query(
      'select status, atendido_por_membro_id, humano_desde from public.conversas where id=$1',
      [c],
    )
    expect(rows[0].status).toBe('ia')
    expect(rows[0].atendido_por_membro_id).toBeNull()
    expect(rows[0].humano_desde).toBeNull()

    const { rows: aud } = await poolSuper.query(
      `select detalhes from public.eventos where entidade_id=$1 and tipo='conversa.handoff_devolvido'`,
      [c],
    )
    expect(aud[0].detalhes).toEqual({ de: 'humano', para: 'ia' })

    await h.esperar(() => h.eventos.length > 0)
    expect(h.eventos[0]).toMatchObject({
      tipo: 'conversa.handoff',
      payload: { conversa_id: c, loja_id: m.lojaId, status: 'ia' },
    })
  })

  it('transicoes invalidas: 422 transicao_invalida; estado inalterado e sem evento', async () => {
    const m = await h.novo()
    const humana = await criarConversa(m, (await criarCliente(m.lojaId, 'C')).id, { status: 'humano' })
    const ia = await criarConversa(m, (await criarCliente(m.lojaId, 'D')).id, { status: 'ia' })
    const enc = await criarConversa(m, (await criarCliente(m.lojaId, 'E')).id, { status: 'encerrada' })
    await h.montar()

    const urls = [
      `/v1/conversas/${humana}/assumir`, // ja humano
      `/v1/conversas/${enc}/assumir`, // terminal
      `/v1/conversas/${ia}/devolver`, // ja na ia
      `/v1/conversas/${enc}/devolver`, // terminal
    ]
    for (const url of urls) {
      const r = await h.app.inject({ method: 'POST', url, headers: bearer(m.userId) })
      expect(r.statusCode, url).toBe(422)
      expect(r.json().error.code, url).toBe('transicao_invalida')
    }
    for (const [id, esperado] of [[humana, 'humano'], [ia, 'ia'], [enc, 'encerrada']] as const) {
      const { rows } = await poolSuper.query('select status from public.conversas where id=$1', [id])
      expect(rows[0].status).toBe(esperado)
    }
    await new Promise((r) => setTimeout(r, 100))
    expect(h.eventos).toHaveLength(0)
  })

  it('SEC-001/002: loja A nao assume nem devolve conversa da loja B (404); B intacta', async () => {
    const a = await h.novo()
    const cenarioA = h.cenario
    const b = await criarMundo((h.cenario = novoCenario()), 'dono')
    const cb = await criarConversa(b, (await criarCliente(b.lojaId, 'Segredo B')).id, { status: 'ia' })
    await h.montar()
    const hA = bearer(a.userId, a.lojaId)
    for (const acao of ['assumir', 'devolver'] as const) {
      const r = await h.app.inject({ method: 'POST', url: `/v1/conversas/${cb}/${acao}`, headers: hA })
      expect(r.statusCode, acao).toBe(404)
      expect(r.json().error.code).toBe('conversa_nao_encontrada')
    }
    const { rows } = await poolSuper.query('select status, atendido_por_membro_id from public.conversas where id=$1', [cb])
    expect(rows[0].status).toBe('ia')
    expect(rows[0].atendido_por_membro_id).toBeNull()
    await limpar(cenarioA)
  })

  it('papeis: atendente comum pode assumir e devolver (conversas:atender)', async () => {
    const m = await h.novo('atendente')
    const c = await criarConversa(m, (await criarCliente(m.lojaId, 'F')).id, { status: 'ia' })
    await h.montar()
    expect((await h.app.inject({ method: 'POST', url: `/v1/conversas/${c}/assumir`, headers: bearer(m.userId) })).statusCode).toBe(200)
    expect((await h.app.inject({ method: 'POST', url: `/v1/conversas/${c}/devolver`, headers: bearer(m.userId) })).statusCode).toBe(200)
  })
})
