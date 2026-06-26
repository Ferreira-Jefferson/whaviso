import { afterAll, describe, expect, it, vi } from 'vitest'
import { processarBotao, processarTexto } from '../service'
import {
  clienteWhatsFake,
  criarAvisoPendente,
  criarEnvioAgendado,
  encerrarPools,
  lerHorario,
  limpar,
  poolSuper,
} from '../../../../test/harness'

// Sem espera entre as duas mensagens do Pix nos testes (H7.3 usa até 3s em produção).
process.env.WHATS_PIX_INTERVALO_MS = '0'

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const TEL = '+5511999998888'

afterAll(async () => {
  await encerrarPools()
})

function botao(acao: string, avisoId: string, etapa?: string, telefone = TEL) {
  return { wamid: 'w_' + acao, telefone, buttonId: etapa ? `${acao}:${avisoId}:${etapa}` : `${acao}:${avisoId}` }
}

/** Marca um envio como ENVIADO numa data (para o teste de "último aviso"). */
async function marcarEnviado(envioId: string, quando: Date): Promise<void> {
  await poolSuper.query(
    `update public.envios set status='enviado', enviado_em=$2 where id=$1`,
    [envioId, quando],
  )
}

describe('E7 interação do devedor', () => {
  // --- H7.2: idempotência + corrida ---------------------------------------------------
  it('G-M3: dois "Já paguei" simultâneos geram UMA única linha em notificacoes_cobrador', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    const whats = clienteWhatsFake()
    const deps = { pool: poolSuper, logger, whats }
    await Promise.all([
      processarBotao(deps, botao('ja_paguei', avisoId)),
      processarBotao(deps, botao('ja_paguei', avisoId)),
    ])
    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('informado_pago')
    const ev = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='ja_paguei_devedor'`,
      [avisoId],
    )
    expect(ev.rows[0].n).toBe(1)
    const notif = await poolSuper.query(
      `select count(*)::int as n from public.notificacoes_cobrador where aviso_id=$1 and tipo='pagamento_informado'`,
      [avisoId],
    )
    expect(notif.rows[0].n).toBe(1)
    await limpar(cobradorId)
  })

  it('re-tap "Já paguei" em informado_pago é silencioso (nada enviado)', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    await poolSuper.query(`update public.avisos set status='informado_pago' where id=$1`, [avisoId])
    const whats = clienteWhatsFake()
    await processarBotao({ pool: poolSuper, logger, whats }, botao('ja_paguei', avisoId))
    expect(whats.enviadas).toHaveLength(0)
    await limpar(cobradorId)
  })

  // --- H7.3: chave de pagamento, duas mensagens, entrega única, 2ª falha --------------
  it('"Chave de Pag." envia 2 mensagens (chave; titular+banco) e marca entregue', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({
      dataCombinada: '2026-12-15',
      pixChave: 'chave@pix.com',
    })
    await poolSuper.query(`update public.avisos set pix_titular='Fulano de Tal', pix_banco='Banco X' where id=$1`, [avisoId])
    const whats = clienteWhatsFake()
    await processarBotao({ pool: poolSuper, logger, whats }, botao('ver_pix', avisoId))
    expect(whats.enviadas).toHaveLength(2)
    expect(whats.enviadas[0]!.texto).toContain('chave@pix.com')
    expect(whats.enviadas[1]!.texto).toContain('Fulano de Tal')
    expect(whats.enviadas[1]!.texto).toContain('Banco X')
    const entrega = await poolSuper.query(`select entrega_chave_status from public.avisos where id=$1`, [avisoId])
    expect(entrega.rows[0].entrega_chave_status).toBe('entregue')
    // Não muda o estado.
    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('programado')
    await limpar(cobradorId)
  })

  it('G-C3: 1ª ok, 2ª (titular+banco) falha → fica reentregável (não marca entregue)', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({
      dataCombinada: '2026-12-15',
      pixChave: 'chave@pix.com',
    })
    await poolSuper.query(`update public.avisos set pix_titular='Fulano', pix_banco='Banco X' where id=$1`, [avisoId])
    let n = 0
    // A 2ª chamada de envio (titular+banco) estoura; a 1ª (chave) passa.
    const whats = clienteWhatsFake(() => {
      n++
      if (n === 2) throw new Error('falha de envio após retrys')
      return { wamid: `w_${n}` }
    })
    await processarBotao({ pool: poolSuper, logger, whats }, botao('ver_pix', avisoId))
    const entrega = await poolSuper.query(`select entrega_chave_status from public.avisos where id=$1`, [avisoId])
    expect(entrega.rows[0].entrega_chave_status).toBeNull() // reentregável
    // Re-tap reentrega (agora sem falha): marca entregue.
    const whats2 = clienteWhatsFake()
    await processarBotao({ pool: poolSuper, logger, whats: whats2 }, botao('ver_pix', avisoId))
    expect(whats2.enviadas).toHaveLength(2)
    const entrega2 = await poolSuper.query(`select entrega_chave_status from public.avisos where id=$1`, [avisoId])
    expect(entrega2.rows[0].entrega_chave_status).toBe('entregue')
    // solicitou_pix gravado só uma vez (1º toque), não duplicou na reentrega.
    const ev = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='solicitou_pix'`,
      [avisoId],
    )
    expect(ev.rows[0].n).toBe(1)
    await limpar(cobradorId)
  })

  // --- H7.4 / H7.5: opt-out + reativar ------------------------------------------------
  it('opt-out → desregistrado, zera horário reservado, confirma com botão Ativar', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    await poolSuper.query(`update public.avisos set horario_reservado_seg=30000, horario_reservado_orig=30000 where id=$1`, [avisoId])
    const whats = clienteWhatsFake()
    await processarBotao({ pool: poolSuper, logger, whats }, botao('optout', avisoId))
    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('desregistrado')
    const h = await lerHorario(avisoId)
    expect(h.seg).toBeNull() // liberou o segundo (H7.4)
    expect(h.orig).toBe(30000) // preserva para reativar reusar
    // Confirmação com botão "Ativar lembretes".
    expect(whats.enviadas).toHaveLength(1)
    expect(whats.enviadas[0]!.botoes?.[0]?.id).toBe(`ativar:${avisoId}`)
    const ev = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='optout' and ator='devedor'`,
      [avisoId],
    )
    expect(ev.rows[0].n).toBe(1)
    await limpar(cobradorId)
  })

  it('reativar (desregistrado → programado): novo horário, catch-up, mensagem sem botão', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    // Simula o estado pós opt-out: desregistrado + segundo zerado, _orig preservado.
    await poolSuper.query(
      `update public.avisos set status='desregistrado', horario_reservado_seg=null, horario_reservado_orig=30000 where id=$1`,
      [avisoId],
    )
    const whats = clienteWhatsFake()
    await processarBotao({ pool: poolSuper, logger, whats }, botao('ativar', avisoId))
    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('programado')
    const h = await lerHorario(avisoId)
    expect(h.seg).not.toBeNull() // pegou um horário de novo
    // Catch-up: data futura (2026-12-15) recria os 4 envios.
    const envios = await poolSuper.query(`select count(*)::int as n from public.envios where aviso_id=$1 and status='agendado'`, [avisoId])
    expect(envios.rows[0].n).toBe(4)
    // Mensagem de confirmação SEM botão (H7.5).
    expect(whats.enviadas).toHaveLength(1)
    expect(whats.enviadas[0]!.botoes ?? []).toHaveLength(0)
    const ev = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='reregistrado'`,
      [avisoId],
    )
    expect(ev.rows[0].n).toBe(1)
    await limpar(cobradorId)
  })

  it('G-M2: reativar combinado VENCIDO (catch-up vazio) fica programado sem envios, sem msg imediata', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2020-01-10' })
    await poolSuper.query(
      `update public.avisos set status='desregistrado', horario_reservado_seg=null, horario_reservado_orig=30000 where id=$1`,
      [avisoId],
    )
    const whats = clienteWhatsFake()
    await processarBotao({ pool: poolSuper, logger, whats }, botao('ativar', avisoId))
    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('programado')
    const envios = await poolSuper.query(`select count(*)::int as n from public.envios where aviso_id=$1 and status='agendado'`, [avisoId])
    expect(envios.rows[0].n).toBe(0) // catch-up vazio: nenhum envio
    await limpar(cobradorId)
  })

  // --- H7.6 / G-M1: validação de telefone condicionada à ação -------------------------
  it('G-M1: botão do ciclo de telefone DIVERGENTE é ignorado (não age)', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    const whats = clienteWhatsFake()
    // telefone do clique != telefone_devedor do aviso.
    await processarBotao({ pool: poolSuper, logger, whats }, botao('ja_paguei', avisoId, undefined, '+5511000000000'))
    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('programado') // não mudou
    expect(whats.enviadas).toHaveLength(0)
    await limpar(cobradorId)
  })

  // --- H7.7: só o último aviso age ----------------------------------------------------
  it('H7.7: botão de etapa ANTERIOR (não é o último enviado) fica inerte', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    const eD2 = await criarEnvioAgendado(avisoId, 'd_menos_2')
    const eD1 = await criarEnvioAgendado(avisoId, 'd_menos_1')
    await marcarEnviado(eD2, new Date('2026-12-13T11:00:00Z'))
    await marcarEnviado(eD1, new Date('2026-12-14T11:00:00Z')) // último enviado = d_menos_1
    const whats = clienteWhatsFake()
    // Toque no botão da etapa ANTIGA (d_menos_2): inerte.
    await processarBotao({ pool: poolSuper, logger, whats }, botao('ja_paguei', avisoId, 'd_menos_2'))
    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('programado') // não mudou
    await limpar(cobradorId)
  })

  it('H7.7: botão da etapa do ÚLTIMO aviso enviado age', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    const eD2 = await criarEnvioAgendado(avisoId, 'd_menos_2')
    const eD1 = await criarEnvioAgendado(avisoId, 'd_menos_1')
    await marcarEnviado(eD2, new Date('2026-12-13T11:00:00Z'))
    await marcarEnviado(eD1, new Date('2026-12-14T11:00:00Z')) // último = d_menos_1
    const whats = clienteWhatsFake()
    await processarBotao({ pool: poolSuper, logger, whats }, botao('ja_paguei', avisoId, 'd_menos_1'))
    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('informado_pago')
    await limpar(cobradorId)
  })

  // --- H7.7 / E11 H11.2: terminais não reabrem; cortesia "encerrado" é universal --------
  for (const terminal of ['pago', 'cancelado', 'recusado', 'expirado'] as const) {
    it(`G-C2: terminal ${terminal} não reabre; cortesia "encerrado" para todos`, async () => {
      const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
      // `recusado` não é alcançável a partir de `programado` (trigger); recria a linha
      // direto nesse status (INSERT não passa pelo trigger de transição). Os demais são
      // transições válidas de `programado`.
      if (terminal === 'recusado') {
        await poolSuper.query(`delete from public.avisos where id=$1`, [avisoId])
        await poolSuper.query(
          `insert into public.avisos (id, cobrador_id, direcao, status, nome_devedor, telefone_devedor, motivo, valor_centavos, data_combinada, pix_chave)
           values ($1,$2,'receber','recusado','Maria',$3,'mensalidade',9900,'2026-12-15','x@pix.com')`,
          [avisoId, cobradorId, TEL],
        )
      } else {
        await poolSuper.query(`update public.avisos set status=$2 where id=$1`, [avisoId, terminal])
      }
      // E11 H11.2: a cortesia "encerrado" é universal (réplica, não consome crédito).
      const w = clienteWhatsFake()
      await processarBotao({ pool: poolSuper, logger, whats: w }, botao('ja_paguei', avisoId))
      expect(w.enviadas).toHaveLength(1)
      expect(w.enviadas[0]!.texto.toLowerCase()).toContain('encerrado')
      const a1 = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
      expect(a1.rows[0].status).toBe(terminal) // não reabriu
      await limpar(cobradorId)
    })
  }

  it('H7.7: aviso_id inválido é ignorado sem vazar', async () => {
    const whats = clienteWhatsFake()
    await processarBotao(
      { pool: poolSuper, logger, whats },
      { wamid: 'w', telefone: TEL, buttonId: 'ja_paguei:nao-e-uuid' },
    )
    expect(whats.enviadas).toHaveLength(0)
  })

  // --- H7.1: texto livre → menu (pago) / silêncio (free) ------------------------------
  it('G-C1: texto livre com 1 programado + 1 informado_pago → menu só do programado (pago)', async () => {
    const { cobradorId, avisoId: prog } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    // Segundo combinado do MESMO telefone, em informado_pago (não acionável).
    await poolSuper.query(
      `insert into public.avisos (cobrador_id, direcao, status, nome_devedor, telefone_devedor, motivo, valor_centavos, data_combinada, pix_chave)
       values ($1,'receber','informado_pago','Maria',$2,'mensalidade',1000,'2026-12-20','x@pix.com')`,
      [cobradorId, TEL],
    )
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, { wamid: 'w', telefone: TEL, texto: 'oi tudo bem?' })
    expect(whats.enviadas).toHaveLength(1)
    // O menu é amarrado ao combinado ACIONÁVEL (programado), não ao informado_pago.
    expect(whats.enviadas[0]!.botoes?.[0]?.id).toContain(prog)
    await limpar(cobradorId)
  })

  it('E11 H11.2: texto livre com combinado acionável → menu (universal, para todos)', async () => {
    // Menu de texto livre é liberado para todos (não há mais gating por plano): havendo um
    // combinado acionável (programado), o menu sai. A resposta é réplica (não consome crédito).
    const { cobradorId, avisoId: prog } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, { wamid: 'w', telefone: TEL, texto: 'alguma coisa' })
    expect(whats.enviadas).toHaveLength(1)
    expect(whats.enviadas[0]!.botoes?.[0]?.id).toContain(prog)
    await limpar(cobradorId)
  })

  it('H7.1: texto livre, único combinado em informado_pago → silêncio total', async () => {
    // Sem combinado ACIONÁVEL (informado_pago não conta): silêncio, independe de saldo.
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    await poolSuper.query(`update public.avisos set status='informado_pago' where id=$1`, [avisoId])
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, { wamid: 'w', telefone: TEL, texto: 'oi' })
    expect(whats.enviadas).toHaveLength(0)
    await limpar(cobradorId)
  })

  // --- E10b: janela de 1min do opt-out + coalescing do par (H10.5) --------------------
  it('E10b: reativar dentro de 1min anula a notificação de saída (janela/coalescing)', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    await poolSuper.query(`update public.avisos set horario_reservado_seg=30000, horario_reservado_orig=30000 where id=$1`, [avisoId])
    const whats = clienteWhatsFake()
    const deps = { pool: poolSuper, logger, whats }

    // Opt-out: enfileira a notificação de saída agendada +1min (ainda não sai), no grupo.
    await processarBotao(deps, botao('optout', avisoId))
    const optout = await poolSuper.query<{ id: string; status: string; agendar_para: Date }>(
      `select id, status, agendar_para from public.notificacoes_cobrador where aviso_id=$1 and tipo='optout'`,
      [avisoId],
    )
    expect(optout.rows).toHaveLength(1)
    expect(optout.rows[0]!.status).toBe('agendado')
    expect(optout.rows[0]!.agendar_para.getTime() - Date.now()).toBeGreaterThan(50_000) // ~60s à frente

    // Reativar DENTRO da janela (a saída ainda não saiu): anula a linha optout do grupo.
    await processarBotao(deps, botao('ativar', avisoId))
    const apos = await poolSuper.query<{ status: string; erro: string | null }>(
      `select status, erro from public.notificacoes_cobrador where aviso_id=$1 and tipo='optout'`,
      [avisoId],
    )
    expect(apos.rows[0]!.status).toBe('cancelado') // sem DELETE
    expect(apos.rows[0]!.erro).toBe('reativacao_anulou')
    // NÃO enfileira reativação (o par se anulou): nada chega ao cobrador.
    const reativ = await poolSuper.query<{ n: string }>(
      `select count(*)::int as n from public.notificacoes_cobrador where aviso_id=$1 and tipo='reativacao'`,
      [avisoId],
    )
    expect(Number(reativ.rows[0]!.n)).toBe(0)
    // Cancelamento auditado (append-only, sem PII).
    const audit = await poolSuper.query<{ n: string }>(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='notificacao_coalescida'`,
      [avisoId],
    )
    expect(Number(audit.rows[0]!.n)).toBe(1)
    await limpar(cobradorId)
  })

  it('E10b: reativar após a notificação de saída ter sido enviada gera 2ª notificação', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    await poolSuper.query(`update public.avisos set horario_reservado_seg=30000, horario_reservado_orig=30000 where id=$1`, [avisoId])
    const whats = clienteWhatsFake()
    const deps = { pool: poolSuper, logger, whats }

    // Opt-out enfileira a saída agendada; simulamos que ela JÁ SAIU (status='enviado'),
    // saindo da janela em que a reativação a anularia.
    await processarBotao(deps, botao('optout', avisoId))
    await poolSuper.query(
      `update public.notificacoes_cobrador set status='enviado', enviado_em=now() where aviso_id=$1 and tipo='optout'`,
      [avisoId],
    )

    // Reativar DEPOIS de a saída ter ido: não há optout pendente a anular -> enfileira a
    // 2a notificação (reativacao) informando que a pessoa voltou ao combinado.
    await processarBotao(deps, botao('ativar', avisoId))
    const reativ = await poolSuper.query<{ n: string; status: string }>(
      `select count(*)::int as n, max(status) as status from public.notificacoes_cobrador where aviso_id=$1 and tipo='reativacao'`,
      [avisoId],
    )
    expect(Number(reativ.rows[0]!.n)).toBe(1)
    expect(reativ.rows[0]!.status).toBe('agendado')
    // A linha optout permanece 'enviado' (não foi anulada: a saída já tinha saído).
    const optout = await poolSuper.query<{ status: string }>(
      `select status from public.notificacoes_cobrador where aviso_id=$1 and tipo='optout'`,
      [avisoId],
    )
    expect(optout.rows[0]!.status).toBe('enviado')
    await limpar(cobradorId)
  })
})
