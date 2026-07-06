// E14 (Cadastro da chave de pagamento pelo cobrador, fluxo invertido): oferta no aceite
// (Gatilho A, com a notificação de aceite SEGURADA), pedido pelo devedor (Gatilho B),
// wizard etapa a etapa, corrigir anterior, finalização (grava chave + snapshot + notifica
// devedor), botão no lembrete e idempotência. Integração com whaviso_dev.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { processarBotao, processarTexto } from '../service'
import { processarEnviosDevidos } from '../../enviar_lembretes'
import { processarNotificacoesCobrador } from '../../notificar_cobrador'
import {
  clienteWhatsFake,
  criarEnvioAgendado,
  encerrarPools,
  limpar,
  poolSuper,
} from '../../../../test/harness'

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never
const TEL_COBRADOR = '+5511960002222'
const TEL_DEVEDOR = '+5511970001111'
const FUTURO = '2026-12-15'

// A notificação ao devedor (devedor.pix_chave_recebida) é enviada por template Meta, que a
// migration 0068 deixa 'pendente' (aprovação real vem da Meta). Aprovamos SÓ durante este
// arquivo para exercitar o envio, e revertemos no fim para não vazar aprovação a outros
// testes que drenam `notificacoes_cobrador` (o dreno é global; ver seed.sql).
async function aprovarPixChaveRecebida(aprovado: boolean): Promise<void> {
  await poolSuper.query(
    `update public.templates
        set status_meta=(case when $1 then 'aprovado' else 'pendente' end)::status_meta_template
      where chave='devedor.pix_chave_recebida'`,
    [aprovado],
  )
}

beforeAll(async () => {
  await aprovarPixChaveRecebida(true)
})

afterAll(async () => {
  await aprovarPixChaveRecebida(false)
  await encerrarPools()
})

let usados: string[] = []
afterEach(async () => {
  if (usados.length > 0) {
    const { rows } = await poolSuper.query<{ id: string }>(
      `select id from public.avisos where cobrador_id = any($1) or devedor_profile_id = any($1)`,
      [usados],
    )
    const ids = rows.map((r) => r.id)
    if (ids.length > 0) {
      await poolSuper.query(`delete from public.sessao_cadastro_pix where aviso_id = any($1)`, [ids])
      await poolSuper.query(`delete from public.notificacoes_cobrador where aviso_id = any($1)`, [ids])
      await poolSuper.query(`delete from public.envios where aviso_id = any($1)`, [ids])
      await poolSuper.query(`delete from public.eventos_aviso where aviso_id = any($1)`, [ids])
      await poolSuper.query(`delete from public.avisos where id = any($1)`, [ids])
    }
    await poolSuper.query(`delete from public.chaves_pix where profile_id = any($1)`, [usados])
  }
  for (const id of usados) await limpar(id).catch(() => undefined)
  usados = []
})

/**
 * Cria um aviso invertido (criador = devedor; cobrador convidado por telefone).
 * Por padrão SEM chave e SEM conta do cobrador. `comContaCobrador` cria o profile do
 * cobrador (telefone = TEL_COBRADOR) e vincula cobrador_id, para testar a gravação em
 * chaves_pix. O devedor sempre tem conta (devedor_profile_id) num plano que envia.
 */
async function criarInvertido(opts: {
  status?: 'aguardando_aceite' | 'programado'
  pixChave?: string | null
  comContaCobrador?: boolean
} = {}): Promise<{ devedorId: string; cobradorId: string | null; avisoId: string }> {
  const devedorId = randomUUID()
  usados.push(devedorId)
  await poolSuper.query(`insert into auth.users (id) values ($1)`, [devedorId])
  await poolSuper.query(`update public.profiles set nome='Devedor', telefone=$2 where id=$1`, [devedorId, TEL_DEVEDOR])
  // E11: notificar o criador é universal (sem gate de plano); a carteira/cortesia vem do trigger.

  let cobradorId: string | null = null
  if (opts.comContaCobrador) {
    cobradorId = randomUUID()
    usados.push(cobradorId)
    await poolSuper.query(`insert into auth.users (id) values ($1)`, [cobradorId])
    await poolSuper.query(`update public.profiles set nome='Cobrador', telefone=$2 where id=$1`, [cobradorId, TEL_COBRADOR])
  }

  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.avisos
       (cobrador_id, devedor_profile_id, direcao, criador_papel, status,
        nome_devedor, telefone_devedor, nome_cobrador, telefone_cobrador,
        motivo, valor_centavos, data_combinada, pix_chave, convite_expira_em)
     values ($1, $2, 'pagar', 'devedor', $3,
             'Devedor', $4, 'Cobrador Convidado', $5,
             'aluguel', 5000, $6, $7, now() + interval '7 days')
     returning id`,
    [
      cobradorId,
      devedorId,
      opts.status ?? 'programado',
      TEL_DEVEDOR,
      TEL_COBRADOR,
      FUTURO,
      opts.pixChave === undefined ? null : opts.pixChave,
    ],
  )
  return { devedorId, cobradorId, avisoId: rows[0]!.id }
}

function botao(acao: string, avisoId: string, telefone: string, etapa?: string) {
  const buttonId = etapa ? `${acao}:${avisoId}:${etapa}` : `${acao}:${avisoId}`
  return { wamid: 'w_' + Math.random(), telefone, buttonId }
}
function texto(telefone: string, t: string) {
  return { wamid: 'w_' + Math.random(), telefone, texto: t }
}

async function contarEvento(avisoId: string, tipo: string): Promise<number> {
  const { rows } = await poolSuper.query<{ n: number }>(
    `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo=$2::tipo_evento`,
    [avisoId, tipo],
  )
  return rows[0]?.n ?? 0
}
async function sessaoStatus(avisoId: string): Promise<{ status: string; etapa: string } | null> {
  const { rows } = await poolSuper.query<{ status: string; etapa: string }>(
    `select status, etapa from public.sessao_cadastro_pix where aviso_id=$1 order by criado_em desc limit 1`,
    [avisoId],
  )
  return rows[0] ?? null
}

describe('E14 H14.2: oferta no aceite (Gatilho A), aceite segurado', () => {
  it('aceitar invertido SEM chave -> oferta ao cobrador; aceite NÃO notificado ainda', async () => {
    const { avisoId } = await criarInvertido({ status: 'aguardando_aceite' })
    const whats = clienteWhatsFake()
    await processarBotao({ pool: poolSuper, logger, whats, admin: null }, botao('aceite', avisoId, TEL_COBRADOR))

    // O aviso foi aceito (programado), mas a resposta ao cobrador é a OFERTA, não o aceite.
    const a = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(a.rows[0].status).toBe('programado')
    expect(whats.enviadas).toHaveLength(1)
    const oferta = whats.enviadas[0]!
    expect(oferta.para).toBe(TEL_COBRADOR)
    expect(oferta.botoes!.map((b) => b.id.split(':')[0])).toEqual(['informar_pix', 'pix_pular'])
    // Sessão de oferta criada e notificação de aceite SEGURADA (não enfileirada).
    expect((await sessaoStatus(avisoId))!.etapa).toBe('oferta')
    const notif = await poolSuper.query(
      `select tipo from public.notificacoes_cobrador where aviso_id=$1 and tipo='convite_aceito'`,
      [avisoId],
    )
    expect(notif.rowCount).toBe(0)
  })

  it('"Agora não" cancela a sessão e enfileira o aceite ao devedor (fallback)', async () => {
    const { avisoId } = await criarInvertido({ status: 'aguardando_aceite' })
    const deps = { pool: poolSuper, logger, whats: clienteWhatsFake(), admin: null }
    await processarBotao(deps, botao('aceite', avisoId, TEL_COBRADOR))
    await processarBotao(deps, botao('pix_pular', avisoId, TEL_COBRADOR))

    expect((await sessaoStatus(avisoId))!.status).toBe('cancelada')
    const notif = await poolSuper.query(
      `select tipo from public.notificacoes_cobrador where aviso_id=$1 and tipo='convite_aceito'`,
      [avisoId],
    )
    expect(notif.rowCount).toBe(1)
  })
})

describe('E14 H14.4-H14.7: wizard etapa a etapa + finalização', () => {
  it('fluxo completo (titular -> banco -> chave -> tipo inferido -> confirma) grava chave, snapshot e notifica', async () => {
    const { devedorId, cobradorId, avisoId } = await criarInvertido({
      status: 'aguardando_aceite',
      comContaCobrador: true,
    })
    const whats = clienteWhatsFake()
    const deps = { pool: poolSuper, logger, whats, admin: null }

    await processarBotao(deps, botao('aceite', avisoId, TEL_COBRADOR)) // oferta
    await processarBotao(deps, botao('informar_pix', avisoId, TEL_COBRADOR)) // -> titular
    await processarTexto(deps, texto(TEL_COBRADOR, 'Fulano de Tal')) // -> instituicao
    await processarTexto(deps, texto(TEL_COBRADOR, 'Banco X')) // -> chave
    await processarTexto(deps, texto(TEL_COBRADOR, 'fulano@pix.com')) // detecta email -> confirmar_tipo
    await processarBotao(deps, botao('pix_confirma_tipo', avisoId, TEL_COBRADOR)) // -> confirmar
    await processarBotao(deps, botao('pix_confirmar', avisoId, TEL_COBRADOR)) // finaliza

    // Snapshot no aviso.
    const a = await poolSuper.query(
      `select pix_chave, pix_titular, pix_banco from public.avisos where id=$1`,
      [avisoId],
    )
    expect(a.rows[0]).toMatchObject({ pix_chave: 'fulano@pix.com', pix_titular: 'Fulano de Tal', pix_banco: 'Banco X' })
    // Chave no cadastro do cobrador (chaves_pix), com o tipo inferido (email).
    const ch = await poolSuper.query(
      `select chave, tipo, titular, banco from public.chaves_pix where profile_id=$1`,
      [cobradorId],
    )
    expect(ch.rows[0]).toMatchObject({ chave: 'fulano@pix.com', tipo: 'email', titular: 'Fulano de Tal', banco: 'Banco X' })
    // Evento + sessão concluída + notificação ao devedor enfileirada.
    expect(await contarEvento(avisoId, 'pix_cadastrada')).toBe(1)
    expect((await sessaoStatus(avisoId))!.status).toBe('concluida')
    const notif = await poolSuper.query(
      `select alvo_papel from public.notificacoes_cobrador where aviso_id=$1 and tipo='pix_chave_recebida'`,
      [avisoId],
    )
    expect(notif.rows.map((r: { alvo_papel: string }) => r.alvo_papel)).toEqual(['devedor'])
    // Última resposta ao cobrador confirma a gravação.
    expect(whats.enviadas.at(-1)!.para).toBe(TEL_COBRADOR)
    void devedorId
  })

  it('tipo ambíguo cai na resposta numerada (1..5) e segue para a confirmação', async () => {
    const { avisoId } = await criarInvertido({ status: 'aguardando_aceite' })
    const whats = clienteWhatsFake()
    const deps = { pool: poolSuper, logger, whats, admin: null }
    await processarBotao(deps, botao('aceite', avisoId, TEL_COBRADOR))
    await processarBotao(deps, botao('informar_pix', avisoId, TEL_COBRADOR))
    await processarTexto(deps, texto(TEL_COBRADOR, 'Maria'))
    await processarTexto(deps, texto(TEL_COBRADOR, 'Banco Y'))
    await processarTexto(deps, texto(TEL_COBRADOR, 'minha-chave-aleatoria')) // ambíguo -> null
    // Está na etapa 'tipo' aguardando número.
    expect((await sessaoStatus(avisoId))!.etapa).toBe('tipo')
    await processarTexto(deps, texto(TEL_COBRADOR, '5')) // 5 = chave aleatória
    await processarBotao(deps, botao('pix_confirmar', avisoId, TEL_COBRADOR))
    const a = await poolSuper.query(`select pix_chave from public.avisos where id=$1`, [avisoId])
    expect(a.rows[0].pix_chave).toBe('minha-chave-aleatoria')
  })

  it('"Corrigir anterior" volta uma etapa mantendo os dados já preenchidos', async () => {
    const { avisoId } = await criarInvertido({ status: 'aguardando_aceite' })
    const whats = clienteWhatsFake()
    const deps = { pool: poolSuper, logger, whats, admin: null }
    await processarBotao(deps, botao('aceite', avisoId, TEL_COBRADOR))
    await processarBotao(deps, botao('informar_pix', avisoId, TEL_COBRADOR))
    await processarTexto(deps, texto(TEL_COBRADOR, 'Fulano')) // -> instituicao
    await processarBotao(deps, botao('pix_corrigir', avisoId, TEL_COBRADOR)) // volta a titular
    expect((await sessaoStatus(avisoId))!.etapa).toBe('titular')
    const s = await poolSuper.query(`select titular from public.sessao_cadastro_pix where aviso_id=$1`, [avisoId])
    expect(s.rows[0].titular).toBe('Fulano') // dado preservado
  })
})

describe('E14 H14.3: pedido pelo devedor (Gatilho B) + botão no lembrete', () => {
  it('solicitar_pix: cobrador recebe a oferta, devedor recebe o aviso, evento registrado; idempotente', async () => {
    const { avisoId } = await criarInvertido({ status: 'programado' })
    const whats = clienteWhatsFake()
    const deps = { pool: poolSuper, logger, whats, admin: null }
    await processarBotao(deps, botao('solicitar_pix', avisoId, TEL_DEVEDOR, 'd_menos_2'))

    expect(whats.enviadas).toHaveLength(2)
    const paraCobrador = whats.enviadas.find((m) => m.para === TEL_COBRADOR)
    const paraDevedor = whats.enviadas.find((m) => m.para === TEL_DEVEDOR)
    expect(paraCobrador!.botoes!.map((b) => b.id.split(':')[0])).toEqual(['informar_pix', 'pix_pular'])
    expect(paraDevedor).toBeDefined()
    expect(await contarEvento(avisoId, 'pix_solicitada')).toBe(1)

    // Toque duplo: já há pedido em aberto -> nada novo (idempotente).
    await processarBotao(deps, botao('solicitar_pix', avisoId, TEL_DEVEDOR, 'd_menos_2'))
    expect(whats.enviadas).toHaveLength(2)
    expect(await contarEvento(avisoId, 'pix_solicitada')).toBe(1)
  })

  it('lembrete do invertido SEM chave troca "Chave de Pag." por "Solicitar chave..."', async () => {
    const { avisoId } = await criarInvertido({ status: 'programado' })
    const envioId = await criarEnvioAgendado(avisoId, 'd')
    const whats = clienteWhatsFake(() => ({ wamid: 'w_ok' }))
    await processarEnviosDevidos({ pool: poolSuper, logger, whats })
    expect(whats.enviadas).toHaveLength(1)
    const acoes = whats.enviadas[0]!.botoes!.map((b) => b.id.split(':')[0])
    expect(acoes).toContain('solicitar_pix')
    expect(acoes).not.toContain('ver_pix')
    void envioId
  })

  it('lembrete do invertido COM chave mantém "Chave de Pag." (ver_pix)', async () => {
    const { avisoId } = await criarInvertido({ status: 'programado', pixChave: 'ja@tem.com' })
    await criarEnvioAgendado(avisoId, 'd')
    const whats = clienteWhatsFake(() => ({ wamid: 'w_ok' }))
    await processarEnviosDevidos({ pool: poolSuper, logger, whats })
    const acoes = whats.enviadas[0]!.botoes!.map((b) => b.id.split(':')[0])
    expect(acoes).toContain('ver_pix')
    expect(acoes).not.toContain('solicitar_pix')
  })
})

describe('E14: finalização idempotente e notificação ao devedor com a chave', () => {
  it('clique duplo em confirmar não grava duas chaves nem duplica evento', async () => {
    const { cobradorId, avisoId } = await criarInvertido({ status: 'aguardando_aceite', comContaCobrador: true })
    const whats = clienteWhatsFake()
    const deps = { pool: poolSuper, logger, whats, admin: null }
    await processarBotao(deps, botao('aceite', avisoId, TEL_COBRADOR))
    await processarBotao(deps, botao('informar_pix', avisoId, TEL_COBRADOR))
    await processarTexto(deps, texto(TEL_COBRADOR, 'Fulano'))
    await processarTexto(deps, texto(TEL_COBRADOR, 'Banco X'))
    await processarTexto(deps, texto(TEL_COBRADOR, 'fulano@pix.com'))
    await processarBotao(deps, botao('pix_confirma_tipo', avisoId, TEL_COBRADOR))
    await processarBotao(deps, botao('pix_confirmar', avisoId, TEL_COBRADOR))
    await processarBotao(deps, botao('pix_confirmar', avisoId, TEL_COBRADOR)) // 2o clique

    const ch = await poolSuper.query(`select count(*)::int as n from public.chaves_pix where profile_id=$1`, [cobradorId])
    expect(ch.rows[0].n).toBe(1)
    expect(await contarEvento(avisoId, 'pix_cadastrada')).toBe(1)
  })

  it('a notificação ao devedor, drenada, entrega a chave/titular/banco', async () => {
    const { avisoId } = await criarInvertido({ status: 'aguardando_aceite', comContaCobrador: true })
    const whats = clienteWhatsFake()
    const deps = { pool: poolSuper, logger, whats, admin: null }
    await processarBotao(deps, botao('aceite', avisoId, TEL_COBRADOR))
    await processarBotao(deps, botao('informar_pix', avisoId, TEL_COBRADOR))
    await processarTexto(deps, texto(TEL_COBRADOR, 'Fulano de Tal'))
    await processarTexto(deps, texto(TEL_COBRADOR, 'Banco X'))
    await processarTexto(deps, texto(TEL_COBRADOR, 'fulano@pix.com'))
    await processarBotao(deps, botao('pix_confirma_tipo', avisoId, TEL_COBRADOR))
    await processarBotao(deps, botao('pix_confirmar', avisoId, TEL_COBRADOR))

    const drenado = clienteWhatsFake(() => ({ wamid: 'w_notif' }))
    await processarNotificacoesCobrador({ pool: poolSuper, logger, whats: drenado, appUrl: 'http://app.local' })
    const aoDevedor = drenado.enviadas.find((m) => m.para === TEL_DEVEDOR)
    expect(aoDevedor).toBeDefined()
    expect(aoDevedor!.texto).toContain('fulano@pix.com')
    expect(aoDevedor!.texto).toContain('Fulano de Tal')
    expect(aoDevedor!.texto).toContain('Banco X')
  })
})
