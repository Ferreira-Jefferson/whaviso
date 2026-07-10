// E5 (Combinado & Aceite pelo WhatsApp): o Whaviso manda o combinado direto ao convidado
// com botões; o aceite/recusa/dado_incorreto chega por botão (ou pelo fallback numerado
// 1/2/3 quando os botões interativos não vingam). Não há mais caminho de "número de
// convite". Cobre também a conta-no-aceite (H5.3). Integração com whaviso_dev.
import { afterEach, afterAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { processarTexto, processarBotao } from '../service'
import { clienteWhatsFake, encerrarPools, limpar, poolSuper } from '../../../../test/harness'

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

afterAll(async () => {
  await encerrarPools()
})

let usados: string[] = []
afterEach(async () => {
  // Remove os avisos do teste (e seus filhos: envios/eventos/notificações têm FK para
  // avisos e bloqueariam o delete). O FK por devedor_profile_id pode não cascatear ao
  // apagar auth.users, então apagamos explicitamente para não colidir no índice único.
  if (usados.length > 0) {
    const { rows } = await poolSuper.query<{ id: string }>(
      `select id from public.avisos where cobrador_id = any($1) or devedor_profile_id = any($1)`,
      [usados],
    )
    const ids = rows.map((r) => r.id)
    if (ids.length > 0) {
      await poolSuper.query(`delete from public.notificacoes_cobrador where aviso_id = any($1)`, [ids])
      await poolSuper.query(`delete from public.envios where aviso_id = any($1)`, [ids])
      await poolSuper.query(`delete from public.eventos_aviso where aviso_id = any($1)`, [ids])
      await poolSuper.query(`delete from public.avisos where id = any($1)`, [ids])
    }
  }
  for (const id of usados) await limpar(id).catch(() => undefined)
  usados = []
})

/** Cria um combinado em aguardando_aceite com telefone-alvo (convidado = devedor). */
async function criarConvite(opts: {
  telefoneDevedor?: string
  pixChave?: string
}): Promise<{ cobradorId: string; avisoId: string }> {
  const cobradorId = randomUUID()
  usados.push(cobradorId)
  await poolSuper.query(`insert into auth.users (id) values ($1)`, [cobradorId])
  await poolSuper.query(`update public.profiles set nome='Cobrador' where id=$1`, [cobradorId])
  const tel = opts.telefoneDevedor ?? '+5511999998888'
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.avisos
       (cobrador_id, direcao, criador_papel, status, nome_devedor, telefone_devedor,
        motivo, valor_centavos, data_combinada, pix_chave, convite_expira_em)
     values ($1,'receber','cobrador','aguardando_aceite','Maria',$2,'mensalidade',9900,
             '2026-12-15',$3, now() + interval '7 days')
     returning id`,
    [cobradorId, tel, opts.pixChave ?? 'cobrador@pix.com'],
  )
  return { cobradorId, avisoId: rows[0]!.id }
}

function texto(telefone: string, t: string) {
  return { wamid: 'w_' + Math.random(), telefone, texto: t }
}

describe('E5 H5.3/H5.4/H5.5: aceite/dado_incorreto/recusa pelo fallback numerado', () => {
  it('fallback "2" (dado incorreto) não muda status, notifica criador, segue aguardando_aceite', async () => {
    const { avisoId } = await criarConvite({ telefoneDevedor: '+5511933332222' })
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto('5511933332222', '2'))
    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('aguardando_aceite')
    const ev = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='pix_incorreto'`,
      [avisoId],
    )
    expect(ev.rows[0].n).toBe(1)
    const notif = await poolSuper.query(`select tipo from public.notificacoes_cobrador where aviso_id=$1`, [avisoId])
    expect(notif.rows.map((r: { tipo: string }) => r.tipo)).toContain('combinado_dado_incorreto')
  })

  it('fallback "1" (aceitar) → programado + 4 envios + notifica criador', async () => {
    const { avisoId } = await criarConvite({ telefoneDevedor: '+5511933331111' })
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto('5511933331111', '1'))
    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('programado')
    const envios = await poolSuper.query(`select count(*)::int as n from public.envios where aviso_id=$1`, [avisoId])
    expect(envios.rows[0].n).toBe(4)
  })

  it('fallback "3" (recusar) → recusado + notifica criador', async () => {
    const { avisoId } = await criarConvite({ telefoneDevedor: '+5511933334444' })
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto('5511933334444', '3'))
    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('recusado')
    const notif = await poolSuper.query(`select tipo from public.notificacoes_cobrador where aviso_id=$1`, [avisoId])
    expect(notif.rows.map((r: { tipo: string }) => r.tipo)).toContain('combinado_recusado')
  })

  it('fallback numerado só age se houver combinado pendente para o telefone', async () => {
    // Telefone sem nenhum combinado pendente: "1" é texto livre qualquer, sem efeito.
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto('5511900000000', '1'))
    expect(whats.enviadas).toHaveLength(0)
  })

  it('toque DUPLO no botão "Aceitar" é idempotente (não duplica envios nem confirmação)', async () => {
    const { avisoId } = await criarConvite({ telefoneDevedor: '+5511933339999' })
    const whats = clienteWhatsFake()
    const deps = { pool: poolSuper, logger, whats }
    const ev = { wamid: 'w1', telefone: '+5511933339999', buttonId: `aceite:${avisoId}` }
    await processarBotao(deps, ev)
    await processarBotao(deps, ev)
    const envios = await poolSuper.query(`select count(*)::int as n from public.envios where aviso_id=$1`, [avisoId])
    expect(envios.rows[0].n).toBe(4) // não duplicou
    expect(whats.enviadas).toHaveLength(1) // só a 1ª confirmação
  })
})

describe('E5 H5.3/G2/G3: conta-no-aceite (cria conta FREE + vincula profile por telefone)', () => {
  it('aceitar sem profile vinculado → cria/vincula a conta (devedor_profile_id) e é idempotente no toque duplo', async () => {
    const { avisoId } = await criarConvite({ telefoneDevedor: '+5511944443333' })
    // uid que o GoTrue "criaria" para o telefone (precisa existir em auth.users p/ a FK).
    const uidConvidado = randomUUID()
    usados.push(uidConvidado)
    await poolSuper.query(`insert into auth.users (id) values ($1)`, [uidConvidado])
    await poolSuper.query(`update public.profiles set nome='Maria' where id=$1`, [uidConvidado])

    let chamadas = 0
    const admin = {
      garantirContaPorTelefone: async () => {
        chamadas++
        return { uid: uidConvidado, jaExistia: false }
      },
    }
    const whats = clienteWhatsFake()
    const deps = { pool: poolSuper, logger, whats, admin }
    const ev = { wamid: 'w1', telefone: '+5511944443333', buttonId: `aceite:${avisoId}` }
    await processarBotao(deps, ev)
    // Vinculou o profile do convidado ao aviso (não fica órfão, G3).
    const a1 = await poolSuper.query(`select status, devedor_profile_id from public.avisos where id=$1`, [avisoId])
    expect(a1.rows[0].status).toBe('programado')
    expect(a1.rows[0].devedor_profile_id).toBe(uidConvidado)
    // Toque duplo: aceite já aplicado (idempotente) → não chama o GoTrue de novo.
    await processarBotao(deps, ev)
    expect(chamadas).toBe(1)
  })

  it('aceitar sem Admin API configurada → vincula só por telefone (degrada sem quebrar)', async () => {
    const { avisoId } = await criarConvite({ telefoneDevedor: '+5511944442222' })
    const whats = clienteWhatsFake()
    // deps SEM admin (null): comportamento anterior, vínculo só por telefone.
    const deps = { pool: poolSuper, logger, whats, admin: null }
    await processarBotao(deps, { wamid: 'w1', telefone: '+5511944442222', buttonId: `aceite:${avisoId}` })
    const a = await poolSuper.query(`select status, devedor_profile_id from public.avisos where id=$1`, [avisoId])
    expect(a.rows[0].status).toBe('programado')
    expect(a.rows[0].devedor_profile_id).toBeNull()
  })
})
