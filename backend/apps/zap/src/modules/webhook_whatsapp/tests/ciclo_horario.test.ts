// E6 (Ciclo de lembretes): ciclo no INVERTIDO (G1), alocação do horário reservado
// (H6.9: unicidade global, 10min/devedor, fallback registrado), liberação em terminal vs
// suspensão, informado_pago para o ciclo + empurrãozinho de D+1, três botões em toda etapa.
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { sha256ConviteHex } from '@whaviso/shared/contracts'
import {
  JANELA_INICIO_SEG,
  JANELA_FIM_SEG,
  DISTANCIA_MIN_SEG,
} from '@whaviso/shared/datas'
import { processarBotao } from '../service'
import { aplicarAcaoBotao } from '../repo'
import {
  clienteWhatsFake,
  criarConviteInvertido,
  criarAvisoPendente,
  criarEnvioAgendado,
  encerrarPools,
  lerEnvio,
  lerHorario,
  limpar,
  poolSuper,
  poolZap,
} from '../../../../test/harness'
import { processarEnviosDevidos } from '../../enviar_lembretes/index'

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never
const futuro = '2026-12-15'

let usados: string[] = []
afterEach(async () => {
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
afterAll(async () => {
  await encerrarPools()
})

async function envios(avisoId: string): Promise<Array<{ etapa: string; status: string; agendado_para: Date }>> {
  const { rows } = await poolSuper.query(
    `select etapa, status, agendado_para from public.envios where aviso_id=$1 order by agendado_para`,
    [avisoId],
  )
  return rows
}

describe('G1: ciclo COMPLETO no fluxo INVERTIDO (cobrador_id null)', () => {
  it('aceitar invertido cria 4 envios e o drainer ENVIA (não descarta por falta de cobrador)', async () => {
    const { devedorId, avisoId } = await criarConviteInvertido({
      dataCombinada: futuro,
      conviteHash: sha256ConviteHex('246810'),
    })
    usados.push(devedorId)
    const whats = clienteWhatsFake()
    // O cobrador convidado aceita pelo botão (telefone do cobrador).
    await processarBotao({ pool: poolSuper, logger, whats }, {
      wamid: 'w1', telefone: '+5511960002222', buttonId: `aceite:${avisoId}`,
    })

    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('programado')
    const es = await envios(avisoId)
    expect(es).toHaveLength(4)

    // Drena D-2 (texto traz "quem recebe"): como a data é futura, agenda AGORA p/ o claim.
    // Cancela as outras etapas para isolar o envio de D-2 no lote.
    await poolSuper.query(
      `update public.envios set status='cancelado' where aviso_id=$1 and etapa <> 'd_menos_2'`,
      [avisoId],
    )
    await poolSuper.query(
      `update public.envios set agendado_para=now() where aviso_id=$1 and etapa='d_menos_2'`,
      [avisoId],
    )
    const enviadoWhats = clienteWhatsFake(() => ({ wamid: 'wamid_invertido' }))
    const n = await processarEnviosDevidos({ pool: poolZap, logger, whats: enviadoWhats })
    expect(n).toBe(1) // ANTES (INNER JOIN) seria 0: o ciclo nunca saía no invertido.
    // O nome de "quem recebe" (cobrador) vem da coluna nome_cobrador (sem profile), G11.
    expect(enviadoWhats.enviadas[0]!.texto).toContain('Cobrador Convidado')
    // Três botões em toda etapa (H6.2).
    expect(enviadoWhats.enviadas[0]!.botoes).toHaveLength(3)
  })
})

describe('H6.9: alocação do horário reservado', () => {
  it('aceite aloca um segundo na janela 08-18 + grava _orig', async () => {
    const { devedorId, avisoId } = await criarConviteInvertido({
      dataCombinada: futuro,
      conviteHash: sha256ConviteHex('112233'),
    })
    usados.push(devedorId)
    await processarBotao({ pool: poolSuper, logger, whats: clienteWhatsFake() }, {
      wamid: 'w1', telefone: '+5511960002222', buttonId: `aceite:${avisoId}`,
    })
    const h = await lerHorario(avisoId)
    expect(h.seg).not.toBeNull()
    expect(h.seg!).toBeGreaterThanOrEqual(JANELA_INICIO_SEG)
    expect(h.seg!).toBeLessThanOrEqual(JANELA_FIM_SEG)
    expect(h.orig).toBe(h.seg)
    // Todas as etapas no MESMO segundo do dia (SP).
    const es = await envios(avisoId)
    const segsDoDia = es.map((e) => {
      const d = new Date(e.agendado_para)
      // converte UTC -> segundo do dia SP (UTC-3)
      const sp = new Date(d.getTime() - 3 * 3600 * 1000)
      return sp.getUTCHours() * 3600 + sp.getUTCMinutes() * 60 + sp.getUTCSeconds()
    })
    expect(new Set(segsDoDia).size).toBe(1)
    expect(segsDoDia[0]).toBe(h.seg)
  })

  it('dois avisos do MESMO devedor ficam a >= 10min; unicidade global vale entre todos', async () => {
    // 1º aviso (receber) do devedor pelo telefone T.
    const T = '+5511955557777'
    const a1 = await criarAvisoPendente({ dataCombinada: futuro, telefone: T })
    usados.push(a1.cobradorId)
    // Aloca manualmente um segundo p/ a1 (simula aceite) chamando reservarHorario via aceite:
    // mais simples: cria um convite e aceita. Em vez disso, gravamos um segundo conhecido.
    await poolSuper.query(
      `update public.avisos set horario_reservado_seg=$2, horario_reservado_orig=$2 where id=$1`,
      [a1.avisoId, 40000],
    )
    // 2º aviso do mesmo devedor (telefone T), aceito agora → deve respeitar 10min.
    const { devedorId, avisoId } = await criarConviteInvertido({
      dataCombinada: futuro,
      telefoneDevedor: T,
      conviteHash: sha256ConviteHex('445566'),
    })
    usados.push(devedorId)
    await processarBotao({ pool: poolSuper, logger, whats: clienteWhatsFake() }, {
      wamid: 'w1', telefone: '+5511960002222', buttonId: `aceite:${avisoId}`,
    })
    const h = await lerHorario(avisoId)
    expect(h.seg).not.toBe(40000) // unicidade global
    expect(Math.abs(h.seg! - 40000)).toBeGreaterThanOrEqual(DISTANCIA_MIN_SEG) // 10min
  })
})

describe('H6.4/H6.9: liberação do horário em terminal vs suspensão', () => {
  it('terminal (pago) libera _seg (=null) preservando _orig', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: futuro })
    usados.push(cobradorId)
    await poolSuper.query(
      `update public.avisos set horario_reservado_seg=$2, horario_reservado_orig=$2 where id=$1`,
      [avisoId, 50000],
    )
    await poolSuper.query(`update public.avisos set status='pago' where id=$1`, [avisoId])
    const h = await lerHorario(avisoId)
    expect(h.seg).toBeNull() // liberou o segundo
    expect(h.orig).toBe(50000) // preservou para reabertura
  })

  it('suspensão (pausado) MANTÉM _seg e _orig (não perde o horário na retomada)', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: futuro })
    usados.push(cobradorId)
    await poolSuper.query(
      `update public.avisos set horario_reservado_seg=$2, horario_reservado_orig=$2 where id=$1`,
      [avisoId, 51000],
    )
    await poolSuper.query(`update public.avisos set status='pausado' where id=$1`, [avisoId])
    const h = await lerHorario(avisoId)
    expect(h.seg).toBe(51000) // mantém
    expect(h.orig).toBe(51000)
  })

  it('suspensão (desregistrado) também MANTÉM o segundo', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: futuro })
    usados.push(cobradorId)
    await poolSuper.query(
      `update public.avisos set horario_reservado_seg=$2, horario_reservado_orig=$2 where id=$1`,
      [avisoId, 52000],
    )
    await poolSuper.query(`update public.avisos set status='desregistrado' where id=$1`, [avisoId])
    const h = await lerHorario(avisoId)
    expect(h.seg).toBe(52000)
  })
})

describe('H6.9 (corrida): aceites concorrentes não colidem no segundo', () => {
  it('dois aceites do MESMO devedor (paralelos) ficam a >= 10min; nunca o mesmo segundo', async () => {
    const { reservarHorario } = await import('@whaviso/shared/datas/horario')
    const { comTransacao } = await import('@whaviso/shared/db')
    const T = '+5511944449999'
    const a1 = await criarAvisoPendente({ dataCombinada: futuro, telefone: T })
    const a2 = await criarAvisoPendente({ dataCombinada: futuro, telefone: T })
    usados.push(a1.cobradorId, a2.cobradorId)

    // Duas transações concorrentes alocam o horário ao MESMO tempo. O lock dos ativos
    // serializa: a 2ª relê os ocupados já com o segundo da 1ª.
    const agora = new Date('2026-12-15T13:00:00Z') // 10:00 SP, dentro da janela
    const [r1, r2] = await Promise.all([
      comTransacao(poolZap, (cli) => reservarHorario(cli, { avisoId: a1.avisoId, telefoneDevedor: T, agora })),
      comTransacao(poolZap, (cli) => reservarHorario(cli, { avisoId: a2.avisoId, telefoneDevedor: T, agora })),
    ])
    expect(r1.seg).not.toBe(r2.seg) // unicidade global
    expect(Math.abs(r1.seg - r2.seg)).toBeGreaterThanOrEqual(DISTANCIA_MIN_SEG) // 10min/devedor
  })
})

describe('H6.5: informado_pago para o ciclo + empurrãozinho de D+1', () => {
  it('ja_paguei cancela etapas restantes (exceto d_mais_1) com marcador distinguível', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: futuro })
    usados.push(cobradorId)
    const idD = await criarEnvioAgendado(avisoId, 'd')
    const idD1 = await criarEnvioAgendado(avisoId, 'd_mais_1')
    await aplicarAcaoBotao(poolSuper, avisoId, 'ja_paguei')

    const eD = await lerEnvio(idD)
    expect(eD.status).toBe('cancelado')
    expect(eD.erro).toBe('informado_pago') // G5: distinguível de 'parou', não poluído
    const eD1 = await lerEnvio(idD1)
    expect(eD1.status).toBe('agendado') // empurrãozinho de D+1 sobrevive
    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('informado_pago')
  })
})
