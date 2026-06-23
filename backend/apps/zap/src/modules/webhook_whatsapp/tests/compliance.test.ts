// Invariantes de compliance do Épico 13 garantidas no SERVIDOR (não só na UI):
//  - H13.7: o devedor só age por BOTÃO; texto livre nunca dispara ação/estado/
//    enfileiramento (não há chat/IA/Pix automático).
//  - H13.6: botão tocado num combinado em estado TERMINAL não reabre nem dispara
//    ação (no máximo silêncio; nunca muda estado nem enfileira nada).
import { afterAll, describe, expect, it, vi } from 'vitest'
import { processarBotao } from '../service'
import {
  clienteWhatsFake,
  criarAvisoPendente,
  encerrarPools,
  limpar,
  poolSuper,
} from '../../../../test/harness'

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

afterAll(async () => {
  await encerrarPools()
})

async function contar(avisoId: string): Promise<{ eventos: number }> {
  const ev = await poolSuper.query(
    `select count(*)::int as n from public.eventos_aviso where aviso_id=$1`,
    [avisoId],
  )
  return { eventos: ev.rows[0].n }
}

describe('compliance: devedor só age por botão (H13.7)', () => {
  // Texto livre chega como payload que NÃO casa "acao:avisoId"; parsearPayloadBotao
  // devolve null e processarBotao retorna sem tocar estado, evento, outbox ou envio.
  it('texto livre não dispara ação, não muda estado, não enfileira nada', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    const whats = clienteWhatsFake()

    // Simula "texto livre" do devedor entrando pelo mesmo caminho de inbound.
    for (const livre of ['já paguei tudo', 'oi, quero negociar', 'aceite', `optout ${avisoId}`]) {
      await processarBotao({ pool: poolSuper, logger, whats }, {
        wamid: 'w', telefone: '+5511999998888', buttonId: livre,
      })
    }

    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('programado') // não mudou
    expect((await contar(avisoId)).eventos).toBe(0) // nenhum evento
    expect(whats.enviadas).toHaveLength(0) // nenhuma resposta/automação
    const notif = await poolSuper.query(
      `select count(*)::int as n from public.notificacoes_cobrador where aviso_id=$1`,
      [avisoId],
    )
    expect(notif.rows[0].n).toBe(0) // nada enfileirado
    await limpar(cobradorId)
  })
})

describe('compliance: estado terminal não reabre no inbound (H13.6)', () => {
  // Estados terminais cobertos por caminho direto programado -> terminal: cancelado,
  // pago, expirado. 'recusado' (F-STATE/D-RECUSADO) só é alcançável de aguardando_aceite,
  // então tem teste próprio abaixo.
  for (const terminal of ['cancelado', 'pago', 'expirado'] as const) {
    it(`botão em aviso ${terminal} não muda estado nem dispara ação`, async () => {
      const { cobradorId, avisoId } = await criarAvisoPendente({
        dataCombinada: '2026-12-15',
        pixChave: '11999990000',
        plano: 'free', // dono free: terminal = silêncio TOTAL (sem cortesia "encerrado", G-C2).
      })
      // Leva ao terminal por caminho permitido pelo trigger (programado -> terminal).
      await poolSuper.query(`update public.avisos set status=$2 where id=$1`, [avisoId, terminal])
      const antes = await contar(avisoId)
      const whats = clienteWhatsFake()

      // Tenta TODAS as ações de devedor sobre o aviso terminal.
      for (const acao of ['ja_paguei', 'optout', 'ver_pix'] as const) {
        await processarBotao({ pool: poolSuper, logger, whats }, {
          wamid: `w_${acao}`, telefone: '+5511999998888', buttonId: `${acao}:${avisoId}`,
        })
      }

      const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
      expect(aviso.rows[0].status).toBe(terminal) // não reabre
      expect((await contar(avisoId)).eventos).toBe(antes.eventos) // sem novos eventos
      expect(whats.enviadas).toHaveLength(0) // sem resposta/ação
      await limpar(cobradorId)
    })
  }

  it("botão em aviso 'recusado' não reabre nem dispara ação", async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({
      dataCombinada: '2026-12-15',
      pixChave: '11999990000',
      plano: 'free', // dono free: terminal = silêncio TOTAL (sem cortesia "encerrado", G-C2).
    })
    // 'recusado' só vem de aguardando_aceite (o trigger proíbe programado->aguardando_aceite),
    // então recriamos o aviso direto em aguardando_aceite e fazemos aguardando_aceite->recusado.
    await poolSuper.query(`delete from public.avisos where id=$1`, [avisoId])
    await poolSuper.query(
      `insert into public.avisos
         (id, cobrador_id, direcao, criador_papel, status, nome_devedor, telefone_devedor, motivo, valor_centavos, data_combinada, pix_chave)
       values ($1,$2,'receber','cobrador','aguardando_aceite','Maria','+5511999998888','mensalidade',9900,'2026-12-15','11999990000')`,
      [avisoId, cobradorId],
    )
    await poolSuper.query(`update public.avisos set status='recusado' where id=$1`, [avisoId])
    const antes = await contar(avisoId)
    const whats = clienteWhatsFake()

    for (const acao of ['ja_paguei', 'optout', 'ver_pix'] as const) {
      await processarBotao({ pool: poolSuper, logger, whats }, {
        wamid: `w_${acao}`, telefone: '+5511999998888', buttonId: `${acao}:${avisoId}`,
      })
    }

    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('recusado') // não reabre
    expect((await contar(avisoId)).eventos).toBe(antes.eventos) // sem novos eventos
    expect(whats.enviadas).toHaveLength(0) // sem resposta/ação
    await limpar(cobradorId)
  })
})
