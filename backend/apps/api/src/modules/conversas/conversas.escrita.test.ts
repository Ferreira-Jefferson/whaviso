// Integracao (Postgres LOCAL whaviso_dev_conversas): resposta humana via outbox, janela, encerrar, eventos e rate limit.
import { describe, it, expect } from 'vitest'
import { bancoAcessivel, poolSuper } from '../../../test/db'
import { criarHarness, bearer, horas } from './tests/harness'
import { JANELA_MS } from './janela'
import { criarCliente, criarConversa } from './tests/fixtures'

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[conversas] banco inacessivel: testes de integracao PULADOS.')

d('conversas: escrita (responder e encerrar)', () => {
  const h = criarHarness()
  it('responder: grava mensagem + envio agendado atomicamente e emite conversa.mensagem sem conteudo', async () => {
    const m = await h.novo()
    const cli = await criarCliente(m.lojaId, 'Dani')
    const c = await criarConversa(m, cli.id, { ultimaEntrada: new Date(Date.now() - horas(1)) })
    await h.montar()
    const texto = 'Seu pedido sai em 20 minutos, segredo-xyz'
    const r = await h.app.inject({
      method: 'POST',
      url: `/v1/conversas/${c}/mensagens`,
      headers: bearer(m.userId),
      payload: { texto },
    })
    expect(r.statusCode).toBe(201)
    const corpo = r.json()
    expect(corpo.mensagem).toMatchObject({ direcao: 'saida', autor: 'humano', tipo: 'texto', conteudo: texto })

    const { rows: msgs } = await poolSuper.query('select * from public.mensagens where conversa_id=$1', [c])
    expect(msgs).toHaveLength(1)
    const { rows: envs } = await poolSuper.query('select * from public.envios where conversa_id=$1', [c])
    expect(envs).toHaveLength(1)
    expect(envs[0]).toMatchObject({
      status: 'agendado',
      template_chave: null,
      destinatario_hash: cli.hash,
      numero_whatsapp_id: m.numeroId,
      loja_id: m.lojaId,
    })
    expect(envs[0].payload).toEqual({ tipo: 'texto', texto })
    const { rows: aud } = await poolSuper.query(`select detalhes from public.eventos where entidade_id=$1 and tipo='conversa.resposta_enviada'`, [c])
    expect(aud).toHaveLength(1)
    expect(JSON.stringify(aud[0])).not.toContain('segredo-xyz')

    await h.esperar(() => h.eventos.length > 0)
    expect(h.eventos).toHaveLength(1)
    expect(h.eventos[0]).toMatchObject({
      tipo: 'conversa.mensagem',
      loja_id: m.lojaId,
      payload: { conversa_id: c, loja_id: m.lojaId, direcao: 'saida', autor: 'humano' },
    })
    expect(JSON.stringify(h.eventos)).not.toContain('segredo-xyz')
  })

  it('responder: rollback desfaz mensagem E nao emite evento quando o outbox falha', async () => {
    const m = await h.novo()
    const cli = await criarCliente(m.lojaId, 'Edu')
    const c = await criarConversa(m, cli.id, { ultimaEntrada: new Date() })
    await h.montar()
    await poolSuper.query(`create or replace function public.t_falha_envio() returns trigger language plpgsql as $$ begin raise exception 'falha de teste'; end $$`)
    await poolSuper.query('create trigger t_falha_envio before insert on public.envios for each row execute function public.t_falha_envio()')
    try {
      const r = await h.app.inject({ method: 'POST', url: `/v1/conversas/${c}/mensagens`, headers: bearer(m.userId), payload: { texto: 'oi' } })
      expect(r.statusCode).toBeGreaterThanOrEqual(400)
    } finally {
      await poolSuper.query('drop trigger t_falha_envio on public.envios')
      await poolSuper.query('drop function public.t_falha_envio()')
    }
    const { rows } = await poolSuper.query('select 1 from public.mensagens where conversa_id=$1', [c])
    expect(rows).toHaveLength(0)
    await new Promise((r) => setTimeout(r, 100))
    expect(h.eventos).toHaveLength(0)
  })

  it('responder: regras de estado e janela (borda exata de 24h pelo relogio injetado)', async () => {
    const m = await h.novo()
    const cli = await criarCliente(m.lojaId, 'Fabi')
    const entrada = new Date('2026-10-27T10:00:00.000Z')
    const c = await criarConversa(m, cli.id, { ultimaEntrada: entrada })
    await h.montar()
    const enviar = (id: string) =>
      h.app.inject({ method: 'POST', url: `/v1/conversas/${id}/mensagens`, headers: bearer(m.userId), payload: { texto: 'oi' } })

    h.relogio = () => new Date(entrada.getTime() + JANELA_MS - 1)
    expect((await enviar(c)).statusCode).toBe(201)
    h.relogio = () => new Date(entrada.getTime() + JANELA_MS)
    const fechada = await enviar(c)
    expect(fechada.statusCode).toBe(409)
    expect(fechada.json().error.code).toBe('janela_fechada')

    const semEntrada = await criarConversa(m, (await criarCliente(m.lojaId, 'G')).id, { ultimaEntrada: null })
    expect((await enviar(semEntrada)).json().error.code).toBe('janela_fechada')

    h.relogio = () => entrada
    const ia = await criarConversa(m, (await criarCliente(m.lojaId, 'H')).id, { status: 'ia', ultimaEntrada: entrada })
    const rIa = await enviar(ia)
    expect(rIa.statusCode).toBe(409)
    expect(rIa.json().error.code).toBe('conversa_com_ia')

    const enc = await criarConversa(m, (await criarCliente(m.lojaId, 'I')).id, { status: 'encerrada', ultimaEntrada: entrada })
    expect((await enviar(enc)).json().error.code).toBe('conversa_encerrada')

    await poolSuper.query(`update public.numeros_whatsapp set status='pausado' where id=$1`, [m.numeroId])
    const pausado = await criarConversa(m, (await criarCliente(m.lojaId, 'J')).id, { ultimaEntrada: entrada })
    expect((await enviar(pausado)).json().error.code).toBe('numero_indisponivel')

    const { rows } = await poolSuper.query('select count(*)::int n from public.envios where loja_id=$1', [m.lojaId])
    expect(rows[0].n).toBe(1) // so o envio da borda aberta
  })

  it('responder: validacao Zod (vazio, gigante, chaves extras, loja_id no corpo e ignorado/recusado)', async () => {
    const m = await h.novo()
    const c = await criarConversa(m, (await criarCliente(m.lojaId, 'K')).id, { ultimaEntrada: new Date() })
    await h.montar()
    const url = `/v1/conversas/${c}/mensagens`
    for (const payload of [{ texto: '' }, { texto: 'x'.repeat(4097) }, { texto: 'a', loja_id: m.lojaId }, {}]) {
      const r = await h.app.inject({ method: 'POST', url, headers: bearer(m.userId), payload })
      expect(r.statusCode).toBe(400)
      expect(r.json().error.code).toBe('entrada_invalida')
    }
    const q = await h.app.inject({ method: 'GET', url: `/v1/conversas?loja_id=${m.lojaId}`, headers: bearer(m.userId) })
    expect(q.statusCode).toBe(400)
  })

  it('SEC-101: limite de respostas por conversa (429 no envelope), sem afetar outra conversa', async () => {
    const m = await h.novo()
    const c1 = await criarConversa(m, (await criarCliente(m.lojaId, 'L')).id, { ultimaEntrada: new Date() })
    const c2 = await criarConversa(m, (await criarCliente(m.lojaId, 'M')).id, { ultimaEntrada: new Date() })
    await h.montar({ respostasPorMinuto: 2 })
    const enviar = (id: string) =>
      h.app.inject({ method: 'POST', url: `/v1/conversas/${id}/mensagens`, headers: bearer(m.userId), payload: { texto: 'oi' } })
    expect((await enviar(c1)).statusCode).toBe(201)
    expect((await enviar(c1)).statusCode).toBe(201)
    const barrada = await enviar(c1)
    expect(barrada.statusCode).toBe(429)
    expect(barrada.json().error.code).toBe('limite_excedido')
    expect((await enviar(c2)).statusCode).toBe(201)
  })

  it('encerrar: status, auditoria, evento conversa.handoff, libera a unicidade; segunda vez 409', async () => {
    const m = await h.novo()
    const cli = await criarCliente(m.lojaId, 'N')
    const c = await criarConversa(m, cli.id, { status: 'ia' })
    await h.montar()
    const r = await h.app.inject({ method: 'POST', url: `/v1/conversas/${c}/encerrar`, headers: bearer(m.userId) })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ id: c, status: 'encerrada' })
    const { rows } = await poolSuper.query('select status from public.conversas where id=$1', [c])
    expect(rows[0].status).toBe('encerrada')
    const { rows: aud } = await poolSuper.query(`select detalhes from public.eventos where entidade_id=$1 and tipo='conversa.encerrada'`, [c])
    expect(aud).toHaveLength(1)
    expect(aud[0].detalhes).toEqual({ de: 'ia', motivo: 'nao_informado' })
    await h.esperar(() => h.eventos.length > 0)
    expect(h.eventos[0]).toMatchObject({ tipo: 'conversa.handoff', payload: { conversa_id: c, loja_id: m.lojaId, status: 'encerrada' } })
    // nova conversa aberta do mesmo cliente passa a ser possivel
    await expect(criarConversa(m, cli.id, { status: 'ia' })).resolves.toBeTruthy()
    const dois = await h.app.inject({ method: 'POST', url: `/v1/conversas/${c}/encerrar`, headers: bearer(m.userId), payload: { motivo: 'resolvida' } })
    expect(dois.statusCode).toBe(409)
    expect(dois.json().error.code).toBe('conversa_encerrada')
    const lida = await h.app.inject({ method: 'POST', url: `/v1/conversas/${c}/lida`, headers: bearer(m.userId) })
    expect(lida.json()).toEqual({ ok: true })
  })

})
