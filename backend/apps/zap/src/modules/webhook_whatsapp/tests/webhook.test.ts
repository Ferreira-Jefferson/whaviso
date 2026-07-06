import { afterAll, describe, expect, it, vi } from 'vitest'
import { processarBotao } from '../service'
import {
  clienteWhatsFake,
  criarAvisoPendente,
  criarEnvioAgendado,
  encerrarPools,
  lerEnvio,
  limpar,
  poolSuper,
} from '../../../../test/harness'

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

afterAll(async () => {
  await encerrarPools()
})

// Inbound de botões pelo webhook da Meta: o evento traz buttonId "acao:avisoId".
// A lógica de estado (aplicarAcaoBotao) é a mesma; muda só o transporte de entrada.
function evento(acao: string, avisoId: string) {
  return { wamid: 'w_' + acao, telefone: '+5511999998888', buttonId: `${acao}:${avisoId}` }
}

describe('inbound de botões (integração)', () => {
  it('botão "Já paguei" → informado_pago, ciclo normal PARA (H6.5), só d_mais_1 sobrevive', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    const envioId = await criarEnvioAgendado(avisoId, 'd')
    const envioD1 = await criarEnvioAgendado(avisoId, 'd_mais_1')
    const whats = clienteWhatsFake()

    await processarBotao({ pool: poolSuper, logger, whats }, evento('ja_paguei', avisoId))

    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('informado_pago')
    // H6.5: o ciclo normal PARA. A etapa 'd' é cancelada (marcador distinguível, G5)...
    const eD = await lerEnvio(envioId)
    expect(eD.status).toBe('cancelado')
    expect(eD.erro).toBe('informado_pago')
    // ...mas o empurrãozinho de D+1 (d_mais_1) sobrevive (única msg possível depois).
    expect((await lerEnvio(envioD1)).status).toBe('agendado')
    const ev = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='ja_paguei_devedor'`,
      [avisoId],
    )
    expect(ev.rows[0].n).toBe(1)
    const notif = await poolSuper.query(
      `select count(*)::int as n from public.notificacoes_cobrador where aviso_id=$1`,
      [avisoId],
    )
    expect(notif.rows[0].n).toBe(1)
    expect(whats.enviadas).toHaveLength(1)
    expect(whats.enviadas[0]!.texto.toLowerCase()).not.toMatch(/d[ií]vida|cobran|atras/)
    await limpar(cobradorId)
  })

  it('opt-out em revisão (informado_pago) é no-op: a máquina de estados só permite programado→desregistrado', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    await poolSuper.query(`update public.avisos set status='informado_pago' where id=$1`, [avisoId])
    const whats = clienteWhatsFake()

    await processarBotao({ pool: poolSuper, logger, whats }, evento('optout', avisoId))

    // Em informado_pago o ciclo já parou; opt-out é silencioso e não muda o estado.
    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('informado_pago')
    const ev = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='optout' and ator='devedor'`,
      [avisoId],
    )
    expect(ev.rows[0].n).toBe(0)
    expect(whats.enviadas).toHaveLength(0)
    await limpar(cobradorId)
  })

  it('"Já paguei" repetido em revisão é idempotente (segue informado_pago)', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    await poolSuper.query(`update public.avisos set status='informado_pago' where id=$1`, [avisoId])
    const whats = clienteWhatsFake()
    await processarBotao({ pool: poolSuper, logger, whats }, evento('ja_paguei', avisoId))
    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('informado_pago')
    await limpar(cobradorId)
  })

  it('clique repetido é idempotente (não reenvia confirmação)', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    const whats = clienteWhatsFake()
    const deps = { pool: poolSuper, logger, whats }
    await processarBotao(deps, evento('optout', avisoId))
    await processarBotao(deps, evento('optout', avisoId))

    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('desregistrado')
    expect(whats.enviadas).toHaveLength(1) // só a primeira vez
    await limpar(cobradorId)
  })

  it('botão "Ver Pix" → evento solicitou_pix, aviso programado, chave enviada como texto', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({
      dataCombinada: '2026-12-15',
      pixChave: '11999990000',
    })
    const whats = clienteWhatsFake()

    await processarBotao({ pool: poolSuper, logger, whats }, evento('ver_pix', avisoId))

    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('programado') // não muda status
    const ev = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='solicitou_pix'`,
      [avisoId],
    )
    expect(ev.rows[0].n).toBe(1)
    expect(whats.enviadas).toHaveLength(1)
    expect(whats.enviadas[0]!.texto).toContain('11999990000')
    await limpar(cobradorId)
  })

  it('"Ver Pix" entrega uma vez por combinado: solicitou_pix 1x, re-tap não reenvia (H7.3)', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({
      dataCombinada: '2026-12-15',
      pixChave: '11999990000',
    })
    const whats = clienteWhatsFake()
    const deps = { pool: poolSuper, logger, whats }
    await processarBotao(deps, evento('ver_pix', avisoId))
    await processarBotao(deps, evento('ver_pix', avisoId))

    // solicitou_pix gravado SÓ no 1º toque (G-C3).
    const ev = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='solicitou_pix'`,
      [avisoId],
    )
    expect(ev.rows[0].n).toBe(1)
    // Entrega única: a chave saiu só na 1ª vez (sem titular/banco, só a 1ª msg).
    expect(whats.enviadas).toHaveLength(1)
    const entrega = await poolSuper.query(`select entrega_chave_status from public.avisos where id=$1`, [avisoId])
    expect(entrega.rows[0].entrega_chave_status).toBe('entregue')
    await limpar(cobradorId)
  })

  it('botão "Aceitar" no convite (aguardando_aceite → programado) cria os envios do ciclo', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    // rebaixa para o estado de convite via INSERT (o trigger proíbe programado→aguardando_aceite).
    await poolSuper.query(`delete from public.avisos where id=$1`, [avisoId])
    const { rows } = await poolSuper.query<{ id: string }>(
      `insert into public.avisos
         (cobrador_id, direcao, criador_papel, status, nome_devedor, telefone_devedor, motivo, valor_centavos, data_combinada, pix_chave)
       values ($1,'receber','cobrador','aguardando_aceite','Maria','+5511999998888','mensalidade',9900,'2026-12-15','cobrador@pix.com')
       returning id`,
      [cobradorId],
    )
    const conviteId = rows[0]!.id
    const whats = clienteWhatsFake()

    await processarBotao({ pool: poolSuper, logger, whats }, evento('aceite', conviteId))

    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [conviteId])
    expect(aviso.rows[0].status).toBe('programado')
    const envios = await poolSuper.query(`select count(*)::int as n from public.envios where aviso_id=$1`, [conviteId])
    expect(envios.rows[0].n).toBe(4)
    const ev = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='aceite'`,
      [conviteId],
    )
    expect(ev.rows[0].n).toBe(1)
    expect(whats.enviadas).toHaveLength(1)
    expect(whats.enviadas[0]!.texto.toLowerCase()).not.toMatch(/d[ií]vida|cobran|atras/)
    await limpar(cobradorId)
  })

  it('botão "Recusar" no convite (aguardando_aceite → recusado), sem envios, notifica criador', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    await poolSuper.query(`delete from public.avisos where id=$1`, [avisoId])
    const { rows } = await poolSuper.query<{ id: string }>(
      `insert into public.avisos
         (cobrador_id, direcao, criador_papel, status, nome_devedor, telefone_devedor, motivo, valor_centavos, data_combinada, pix_chave)
       values ($1,'receber','cobrador','aguardando_aceite','Maria','+5511999998888','mensalidade',9900,'2026-12-15','cobrador@pix.com')
       returning id`,
      [cobradorId],
    )
    const conviteId = rows[0]!.id
    const whats = clienteWhatsFake()

    await processarBotao({ pool: poolSuper, logger, whats }, evento('recusa', conviteId))

    // D-RECUSADO: recusa do convidado vai para o terminal PRÓPRIO `recusado`.
    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [conviteId])
    expect(aviso.rows[0].status).toBe('recusado')
    const envios = await poolSuper.query(`select count(*)::int as n from public.envios where aviso_id=$1`, [conviteId])
    expect(envios.rows[0].n).toBe(0)
    const ev = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='recusado'`,
      [conviteId],
    )
    expect(ev.rows[0].n).toBe(1)
    const notif = await poolSuper.query(
      `select tipo from public.notificacoes_cobrador where aviso_id=$1`,
      [conviteId],
    )
    expect(notif.rows.map((r: { tipo: string }) => r.tipo)).toContain('convite_recusado')
    // Resposta neutra ao convidado (resposta.recusa), sem palavra proibida.
    expect(whats.enviadas).toHaveLength(1)
    expect(whats.enviadas[0]!.texto.toLowerCase()).not.toMatch(/d[ií]vida|cobran|atras/)
    await limpar(cobradorId)
  })

  it('clique em aviso inexistente é ignorado sem erro', async () => {
    const whats = clienteWhatsFake()
    await processarBotao(
      { pool: poolSuper, logger, whats },
      evento('ja_paguei', '00000000-0000-0000-0000-000000000000'),
    )
    expect(whats.enviadas).toHaveLength(0)
  })
})
