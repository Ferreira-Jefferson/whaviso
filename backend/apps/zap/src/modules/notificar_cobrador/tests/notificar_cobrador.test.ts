import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { processarNotificacoesCobrador } from '../index'
import { enfileirarNotificacao, grupoOptoutReativa, cancelarOptoutPendente } from '../../../shared/notificacoes'
import {
  clienteWhatsFake,
  criarAvisoInvertido,
  criarAvisoPendente,
  encerrarPools,
  limpar,
  poolSuper,
  poolZap,
} from '../../../../test/harness'

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never
const futuro = '2026-12-15'
const APP_URL = 'http://app.local'

// Insere direto na outbox generalizada (atalho de fixture; o roteamento por alvo é
// testado pelo enfileirador real mais abaixo).
async function enfileirar(
  avisoId: string,
  opts: { cobradorId?: string | null; telefoneAlvo?: string | null; alvoPapel?: 'cobrador' | 'devedor'; tipo?: string },
): Promise<string> {
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.notificacoes_cobrador (aviso_id, tipo, alvo_papel, cobrador_id, telefone_alvo)
     values ($1,$2,$3,$4,$5) returning id`,
    [
      avisoId,
      opts.tipo ?? 'pagamento_informado',
      opts.alvoPapel ?? 'cobrador',
      opts.cobradorId ?? null,
      opts.telefoneAlvo ?? null,
    ],
  )
  return rows[0]!.id
}

async function emRevisao(): Promise<{ cobradorId: string; avisoId: string }> {
  const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: futuro })
  await poolSuper.query(`update public.avisos set status='informado_pago' where id=$1`, [avisoId])
  return { cobradorId, avisoId }
}

async function lerNotif(id: string): Promise<{ status: string; wamid: string | null; erro: string | null; tentativas: number; proxima: Date | null }> {
  const { rows } = await poolSuper.query(
    `select status, wamid, erro, tentativas, proxima_tentativa_em as proxima from public.notificacoes_cobrador where id=$1`,
    [id],
  )
  return rows[0]
}

function ativarTemplate(chave: string, ativo: boolean): Promise<unknown> {
  return poolSuper.query(
    `update public.templates
       set ativo=$2,
           status_meta=(case when $2 then 'aprovado' else 'pendente' end)::status_meta_template
     where chave=$1`,
    [chave, ativo],
  )
}

afterAll(async () => {
  await ativarTemplate('cobrador.pagamento_informado', false)
  await encerrarPools()
})

describe('notificar_cobrador: gating por template (H12.8)', () => {
  beforeEach(async () => {
    await ativarTemplate('cobrador.pagamento_informado', false)
  })

  it('GATED: sem template ativo, não envia, devolve a linha a agendado + erro visível', async () => {
    const { cobradorId, avisoId } = await emRevisao()
    await poolSuper.query(`update public.profiles set telefone='+5511988887777' where id=$1`, [cobradorId])
    const notifId = await enfileirar(avisoId, { cobradorId })
    const whats = clienteWhatsFake(() => ({ wamid: 'nao_deveria' }))

    const n = await processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL })
    expect(n).toBe(0)
    expect(whats.enviadas).toHaveLength(0)
    const notif = await lerNotif(notifId)
    expect(notif.status).toBe('agendado')
    expect(notif.erro).toBe('sem_template_ativo')
    await limpar(cobradorId)
  })

  it('RE-DRAIN: ativando o template, a mesma linha drena e envia', async () => {
    const { cobradorId, avisoId } = await emRevisao()
    await poolSuper.query(`update public.profiles set telefone='+5511988887777' where id=$1`, [cobradorId])
    const notifId = await enfileirar(avisoId, { cobradorId })
    const whats = clienteWhatsFake(() => ({ wamid: 'w_redrain' }))

    await processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL })
    expect((await lerNotif(notifId)).erro).toBe('sem_template_ativo')

    await ativarTemplate('cobrador.pagamento_informado', true)
    const n = await processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL })
    expect(n).toBe(1)
    const notif = await lerNotif(notifId)
    expect(notif.status).toBe('enviado')
    expect(notif.wamid).toBe('w_redrain')
    expect(notif.erro).toBeNull()
    await limpar(cobradorId)
  })
})

describe('notificar_cobrador: roteamento por alvo (H10.1/H10.7)', () => {
  beforeEach(async () => {
    await ativarTemplate('cobrador.pagamento_informado', true)
  })
  afterAll(async () => {
    await ativarTemplate('cobrador.pagamento_informado', false)
  })

  it('cobrador COM conta: envia ao telefone do profile, SEM a CTA de criar conta (H10.7)', async () => {
    const { cobradorId, avisoId } = await emRevisao()
    await poolSuper.query(`update public.profiles set telefone='+5511988887777' where id=$1`, [cobradorId])
    const notifId = await enfileirar(avisoId, { cobradorId })
    let destino = ''
    let texto = ''
    const whats = clienteWhatsFake((m) => {
      destino = m.para
      texto = m.texto
      return { wamid: 'w1' }
    })

    const n = await processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL })
    expect(n).toBe(1)
    expect(destino).toBe('+5511988887777')
    // Quem já tem conta NÃO recebe a linha de cadastro.
    expect(texto).not.toContain(`${APP_URL}/entrar`)
    expect(texto.toLowerCase()).not.toContain('crie sua conta')
    expect((await lerNotif(notifId)).status).toBe('enviado')
    await limpar(cobradorId)
  })

  it('cobrador SEM conta: envia ao telefone_alvo (cobrador_id null) COM a CTA de criar conta (H10.7)', async () => {
    const { cobradorId, avisoId } = await emRevisao()
    const notifId = await enfileirar(avisoId, { cobradorId: null, telefoneAlvo: '+5511955554444', alvoPapel: 'cobrador' })
    let destino = ''
    let texto = ''
    const whats = clienteWhatsFake((m) => {
      destino = m.para
      texto = m.texto
      return { wamid: 'w2' }
    })

    const n = await processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL })
    expect(n).toBe(1)
    expect(destino).toBe('+5511955554444')
    // Cobrador sem conta recebe a CTA discreta com o link de cadastro ao fim da mensagem.
    expect(texto).toContain(`${APP_URL}/entrar`)
    expect((await lerNotif(notifId)).status).toBe('enviado')
    await limpar(cobradorId)
  })

  it('devedor-criador (invertido) COM conta: envia ao telefone do profile do devedor', async () => {
    const { devedorId, avisoId } = await criarAvisoInvertido({ dataCombinada: futuro })
    await poolSuper.query(`update public.avisos set status='informado_pago' where id=$1`, [avisoId])
    await poolSuper.query(`update public.profiles set telefone='+5511970001111' where id=$1`, [devedorId])
    await enfileirar(avisoId, { cobradorId: devedorId, alvoPapel: 'devedor' })
    let destino = ''
    const whats = clienteWhatsFake((m) => {
      destino = m.para
      return { wamid: 'w3' }
    })

    const n = await processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL })
    expect(n).toBe(1)
    expect(destino).toBe('+5511970001111')
    await limpar(devedorId)
  })

  it('aviso saiu de revisão (cobrador já agiu): cancela com evento_superado', async () => {
    const { cobradorId, avisoId } = await emRevisao()
    await poolSuper.query(`update public.profiles set telefone='+5511988887777' where id=$1`, [cobradorId])
    const notifId = await enfileirar(avisoId, { cobradorId })
    await poolSuper.query(`update public.avisos set status='pago' where id=$1`, [avisoId])
    const whats = clienteWhatsFake(() => ({ wamid: 'x' }))

    await processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL })
    expect(whats.enviadas).toHaveLength(0)
    const notif = await lerNotif(notifId)
    expect(notif.status).toBe('cancelado')
    expect(notif.erro).toBe('evento_superado')
    await limpar(cobradorId)
  })

  it('alvo sem telefone: cancela com alvo_sem_telefone', async () => {
    const { cobradorId, avisoId } = await emRevisao()
    await poolSuper.query(`update public.profiles set telefone=null where id=$1`, [cobradorId])
    const notifId = await enfileirar(avisoId, { cobradorId })
    const whats = clienteWhatsFake(() => ({ wamid: 'x' }))

    await processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL })
    expect(whats.enviadas).toHaveLength(0)
    const notif = await lerNotif(notifId)
    expect(notif.status).toBe('cancelado')
    expect(notif.erro).toBe('alvo_sem_telefone')
    await limpar(cobradorId)
  })
})

describe('notificar_cobrador: retry 20-60s, exatamente 3 tentativas (H6.8/H10.1)', () => {
  beforeEach(async () => {
    await ativarTemplate('cobrador.pagamento_informado', true)
  })
  afterAll(async () => {
    await ativarTemplate('cobrador.pagamento_informado', false)
  })

  it('falha transitória reagenda com proxima_tentativa_em em 20-60s; esgota em 3 e fica falho visível', async () => {
    const { cobradorId, avisoId } = await emRevisao()
    await poolSuper.query(`update public.profiles set telefone='+5511988887777' where id=$1`, [cobradorId])
    const notifId = await enfileirar(avisoId, { cobradorId })
    // Sempre lança erro transitório.
    const whats = clienteWhatsFake(() => {
      throw new Error('rede caiu')
    })

    // 1a tentativa -> reagenda (tentativas=1), proxima em 20-60s.
    await processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL })
    let n = await lerNotif(notifId)
    expect(n.status).toBe('agendado')
    expect(n.tentativas).toBe(1)
    const espera = (n.proxima!.getTime() - Date.now()) / 1000
    expect(espera).toBeGreaterThanOrEqual(15) // folga de relógio
    expect(espera).toBeLessThanOrEqual(65)

    // Libera o relógio (zera proxima_tentativa_em) e tenta de novo: 2a -> reagenda.
    await poolSuper.query(`update public.notificacoes_cobrador set proxima_tentativa_em=null where id=$1`, [notifId])
    await processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL })
    n = await lerNotif(notifId)
    expect(n.status).toBe('agendado')
    expect(n.tentativas).toBe(2)

    // 3a -> falha definitiva (nunca uma 4a).
    await poolSuper.query(`update public.notificacoes_cobrador set proxima_tentativa_em=null where id=$1`, [notifId])
    await processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL })
    n = await lerNotif(notifId)
    expect(n.status).toBe('falhou')
    expect(n.tentativas).toBe(3)
    await limpar(cobradorId)
  })
})

describe('notificar_cobrador: dedupe por dedupe_key (H10.2/H10.8)', () => {
  it('toque duplo "já paguei" = 1 notificação ativa; pago->rejeitado->pago = 2 (ocorrência avança)', async () => {
    const { cobradorId, avisoId } = await emRevisao()
    const aviso = {
      id: avisoId,
      criador_papel: 'cobrador' as const,
      cobrador_id: cobradorId,
      devedor_profile_id: null,
      telefone_cobrador: null,
      telefone_devedor: '+5511999998888',
    }
    const cli = await poolSuper.connect()
    try {
      // 1o "já paguei": grava o evento-fonte e enfileira (ocorrência 1).
      await cli.query(`insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1,'ja_paguei_devedor','devedor')`, [avisoId])
      const r1 = await enfileirarNotificacao(cli, aviso, 'pagamento_informado')
      expect(r1.enfileirado).toBe(true)
      // Toque duplo (mesma ocorrência, sem novo evento): dedupe barra a 2a linha.
      const r2 = await enfileirarNotificacao(cli, aviso, 'pagamento_informado')
      expect(r2.enfileirado).toBe(false)

      let count = await cli.query<{ n: string }>(
        `select count(*)::int as n from public.notificacoes_cobrador where aviso_id=$1 and status<>'cancelado'`,
        [avisoId],
      )
      expect(Number(count.rows[0]!.n)).toBe(1)

      // Cobrador rejeitou e o devedor pagou de novo: NOVO evento-fonte (ocorrência 2).
      await cli.query(`insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1,'ja_paguei_devedor','devedor')`, [avisoId])
      const r3 = await enfileirarNotificacao(cli, aviso, 'pagamento_informado')
      expect(r3.enfileirado).toBe(true)

      count = await cli.query<{ n: string }>(
        `select count(*)::int as n from public.notificacoes_cobrador where aviso_id=$1 and status<>'cancelado'`,
        [avisoId],
      )
      expect(Number(count.rows[0]!.n)).toBe(2)
    } finally {
      cli.release()
    }
    await limpar(cobradorId)
  })
})

describe('notificar_cobrador: 2 drainers concorrentes (SKIP LOCKED)', () => {
  beforeEach(async () => {
    await ativarTemplate('cobrador.pagamento_informado', true)
  })
  afterAll(async () => {
    await ativarTemplate('cobrador.pagamento_informado', false)
  })

  it('dois drainers em paralelo não enviam a mesma notificação duas vezes', async () => {
    const { cobradorId, avisoId } = await emRevisao()
    await poolSuper.query(`update public.profiles set telefone='+5511988887777' where id=$1`, [cobradorId])
    const notifId = await enfileirar(avisoId, { cobradorId })
    const whats = clienteWhatsFake()

    const [a, b] = await Promise.all([
      processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL }),
      processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL }),
    ])
    expect(a + b).toBe(1) // só um dos dois reivindica e envia
    expect(whats.enviadas).toHaveLength(1)
    expect((await lerNotif(notifId)).status).toBe('enviado')
    await limpar(cobradorId)
  })
})

// E10b: comportamento de fila de saída (espaçamento, janela do opt-out, coalescing,
// limite de plano). Usa a infra da 0041 + drainer/enfileirador reais.
describe('notificar_cobrador: E10b fila de saída (H10.5/H10.8/H10.9)', () => {
  beforeEach(async () => {
    await ativarTemplate('cobrador.pagamento_informado', true)
    await ativarTemplate('cobrador.optout', true)
    await ativarTemplate('cobrador.reativacao', true)
  })
  afterAll(async () => {
    await ativarTemplate('cobrador.pagamento_informado', false)
    await ativarTemplate('cobrador.optout', false)
    await ativarTemplate('cobrador.reativacao', false)
  })

  it('E10b: espaçamento de 10min por destinatário entre notificações (H10.9)', async () => {
    // Dois combinados do MESMO cobrador (mesmo destinatário do espaçamento), ambos com
    // notificação devida. O drainer só pode liberar UMA por janela de 10min.
    const { cobradorId, avisoId: a1 } = await emRevisao()
    await poolSuper.query(`update public.profiles set telefone='+5511988887777' where id=$1`, [cobradorId])
    // Segundo combinado do mesmo cobrador, também em revisão.
    const { rows: r2 } = await poolSuper.query<{ id: string }>(
      `insert into public.avisos (cobrador_id, direcao, status, nome_devedor, telefone_devedor, motivo, valor_centavos, data_combinada, pix_chave)
       values ($1,'receber','informado_pago','Maria','+5511955551111','aluguel',5000,$2,'x@pix.com') returning id`,
      [cobradorId, futuro],
    )
    const a2 = r2[0]!.id
    const n1 = await enfileirar(a1, { cobradorId })
    const n2 = await enfileirar(a2, { cobradorId })
    const whats = clienteWhatsFake()

    // 1o drain: só uma das duas sai (a outra fica represada pelo espaçamento de 10min).
    const e1 = await processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL })
    expect(e1).toBe(1)
    expect(whats.enviadas).toHaveLength(1)
    const enviadas1 = [await lerNotif(n1), await lerNotif(n2)].filter((n) => n.status === 'enviado')
    expect(enviadas1).toHaveLength(1)

    // 2o drain imediato: a 2a ainda está dentro dos 10min do envio recente -> não sai.
    const e2 = await processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL })
    expect(e2).toBe(0)
    expect(whats.enviadas).toHaveLength(1)

    // Recua o enviado_em da 1a para >10min atrás: o gate de espaçamento libera a 2a.
    await poolSuper.query(
      `update public.notificacoes_cobrador set enviado_em=now() - interval '11 minutes' where status='enviado' and cobrador_id=$1`,
      [cobradorId],
    )
    const e3 = await processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL })
    expect(e3).toBe(1)
    expect(whats.enviadas).toHaveLength(2)
    const ambasEnviadas = [await lerNotif(n1), await lerNotif(n2)].every((n) => n.status === 'enviado')
    expect(ambasEnviadas).toBe(true)
    await limpar(cobradorId)
  })

  it('E10b/E7: opt-out agenda +1min e reativação dentro da janela cancela (par se anula, H10.5)', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: futuro })
    await poolSuper.query(`update public.profiles set telefone='+5511988887777' where id=$1`, [cobradorId])
    const aviso = {
      id: avisoId,
      criador_papel: 'cobrador' as const,
      cobrador_id: cobradorId,
      devedor_profile_id: null,
      telefone_cobrador: null,
      telefone_devedor: '+5511999998888',
    }
    const cli = await poolSuper.connect()
    let optoutId = ''
    try {
      // Opt-out: enfileira agendado +60s, no grupo de coalescing.
      await cli.query(`insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1,'optout','devedor')`, [avisoId])
      const r = await enfileirarNotificacao(cli, aviso, 'optout', {
        agendarAposSeg: 60,
        coalesceGrupo: grupoOptoutReativa(avisoId),
      })
      expect(r.enfileirado).toBe(true)
      const { rows } = await cli.query<{ id: string; agendar_para: Date }>(
        `select id, agendar_para from public.notificacoes_cobrador where aviso_id=$1 and tipo='optout'`,
        [avisoId],
      )
      optoutId = rows[0]!.id
      const adiamento = (rows[0]!.agendar_para.getTime() - Date.now()) / 1000
      expect(adiamento).toBeGreaterThan(50) // ~60s à frente
      expect(adiamento).toBeLessThanOrEqual(61)

      // Reativação DENTRO da janela: anula a linha optout do grupo (par se anula).
      const anuladas = await cancelarOptoutPendente(cli, avisoId)
      expect(anuladas).toBe(1)
      // NÃO enfileira reativação (o par se neutralizou).
    } finally {
      cli.release()
    }
    // A linha optout está cancelada (sem DELETE) com motivo auditável.
    const opt = await lerNotif(optoutId)
    expect(opt.status).toBe('cancelado')
    expect(opt.erro).toBe('reativacao_anulou')
    // Cancelamento auditado em eventos_aviso (append-only, sem PII).
    const audit = await poolSuper.query<{ n: string }>(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='notificacao_coalescida'`,
      [avisoId],
    )
    expect(Number(audit.rows[0]!.n)).toBe(1)
    // Drain: nada chega ao cobrador (par anulado, nenhuma reativação enfileirada).
    const whats = clienteWhatsFake()
    const e = await processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL })
    expect(e).toBe(0)
    expect(whats.enviadas).toHaveLength(0)
    await limpar(cobradorId)
  })

  it('E10b/E7: opt-out enviado, depois reativa -> 2a notificação (reativacao) chega (H10.5)', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: futuro })
    await poolSuper.query(`update public.profiles set telefone='+5511988887777' where id=$1`, [cobradorId])
    const aviso = {
      id: avisoId,
      criador_papel: 'cobrador' as const,
      cobrador_id: cobradorId,
      devedor_profile_id: null,
      telefone_cobrador: null,
      telefone_devedor: '+5511999998888',
    }
    // Opt-out enfileirado e levado ao estado terminal (desregistrado) para a reconferência
    // do drainer não descartar a linha como obsoleta.
    await poolSuper.query(`update public.avisos set status='desregistrado' where id=$1`, [avisoId])
    const cli = await poolSuper.connect()
    try {
      await cli.query(`insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1,'optout','devedor')`, [avisoId])
      await enfileirarNotificacao(cli, aviso, 'optout', {
        agendarAposSeg: 60,
        coalesceGrupo: grupoOptoutReativa(avisoId),
      })
    } finally {
      cli.release()
    }
    // A janela passou: solta o agendamento e drena -> opt-out sai.
    await poolSuper.query(`update public.notificacoes_cobrador set agendar_para=now() - interval '1 second' where aviso_id=$1 and tipo='optout'`, [avisoId])
    const whats = clienteWhatsFake()
    const e1 = await processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL })
    expect(e1).toBe(1)
    expect(whats.enviadas).toHaveLength(1)

    // Reativa DEPOIS de a saída ter ido: cancelarOptoutPendente não acha pendente (0) ->
    // o produtor enfileira a 2a notificação (reativacao). Volta ao ciclo (programado).
    await poolSuper.query(`update public.avisos set status='programado' where id=$1`, [avisoId])
    const cli2 = await poolSuper.connect()
    try {
      const anuladas = await cancelarOptoutPendente(cli2, avisoId)
      expect(anuladas).toBe(0) // nada pendente: a saída já saiu
      await cli2.query(`insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1,'reregistrado','devedor')`, [avisoId])
      const r = await enfileirarNotificacao(cli2, aviso, 'reativacao')
      expect(r.enfileirado).toBe(true)
    } finally {
      cli2.release()
    }
    // O envio recente do opt-out está dentro dos 10min: solta o espaçamento p/ testar a 2a.
    await poolSuper.query(`update public.notificacoes_cobrador set enviado_em=now() - interval '11 minutes' where status='enviado' and aviso_id=$1`, [avisoId])
    const e2 = await processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL })
    expect(e2).toBe(1)
    expect(whats.enviadas).toHaveLength(2)
    const reativ = await poolSuper.query<{ status: string }>(
      `select status from public.notificacoes_cobrador where aviso_id=$1 and tipo='reativacao'`,
      [avisoId],
    )
    expect(reativ.rows[0]!.status).toBe('enviado')
    await limpar(cobradorId)
  })

  it('E11 H11.2: notificar o criador é UNIVERSAL (sem gate de plano; envia para todos)', async () => {
    // Não há mais "plano somente leitura": notificar o CRIADOR (cobrador) não é lembrete ao
    // devedor nem consome crédito. A notificação SAI por WhatsApp para qualquer conta.
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: futuro })
    await poolSuper.query(`update public.avisos set status='informado_pago' where id=$1`, [avisoId])
    await poolSuper.query(`update public.profiles set telefone='+5511988887777' where id=$1`, [cobradorId])
    const notifId = await enfileirar(avisoId, { cobradorId })
    const whats = clienteWhatsFake(() => ({ wamid: 'enviou_ok' }))

    const e = await processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL })
    expect(e).toBe(1)
    expect(whats.enviadas).toHaveLength(1)
    const notif = await lerNotif(notifId)
    expect(notif.status).toBe('enviado')
    await limpar(cobradorId)
  })
})

describe('E8: encerramento ao devedor + corrida claim-vs-reabertura (C1)', () => {
  beforeEach(async () => {
    await ativarTemplate('devedor.encerramento', true)
  })
  afterAll(async () => {
    await ativarTemplate('devedor.encerramento', false)
  })

  it('C1: encerramento já reivindicado ("processando") mas o aviso foi REABERTO antes do envio: NÃO sai e é coalescido', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: futuro })
    // O combinado foi confirmado (pago) e o encerramento ao DEVEDOR ficou agendado +1min.
    await poolSuper.query(`update public.avisos set status='pago' where id=$1`, [avisoId])
    // Devedor com conta para rotear por profile (telefone).
    await poolSuper.query(`update public.profiles set telefone='+5511955554444' where id=$1`, [cobradorId])
    // Enfileira o encerramento ao DEVEDOR. devedor_profile_id = cobradorId aqui? Não: o
    // devedor não tem conta neste fixture, então roteia por telefone_alvo direto.
    const notifId = await enfileirar(avisoId, {
      telefoneAlvo: '+5511999998888', alvoPapel: 'devedor', tipo: 'encerramento',
    })
    // Simula a CORRIDA: o drainer já reivindicou (status='processando') no instante exato
    // em que o cobrador REABRIU (aviso volta a 'programado').
    await poolSuper.query(`update public.notificacoes_cobrador set status='processando' where id=$1`, [notifId])
    await poolSuper.query(`update public.avisos set status='programado' where id=$1`, [avisoId])
    // ressuscitarTravados devolve 'processando' antigo a 'agendado'; forçamos criado_em
    // antigo para o ressuscitar pegá-la, então o claim a reivindica e o recheck a barra.
    await poolSuper.query(`update public.notificacoes_cobrador set criado_em=now() - interval '20 minutes' where id=$1`, [notifId])

    const whats = clienteWhatsFake(() => ({ wamid: 'nao_deveria_sair' }))
    await processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL })
    // C1: o aviso não está mais 'pago' -> aindaValida falha -> NÃO envia, coalesce auditado.
    expect(whats.enviadas).toHaveLength(0)
    const notif = await lerNotif(notifId)
    expect(notif.status).toBe('cancelado')
    expect(notif.erro).toBe('evento_superado')
    await limpar(cobradorId)
  })

  it('encerramento sai quando o aviso AINDA está pago no disparo', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: futuro })
    await poolSuper.query(`update public.avisos set status='pago' where id=$1`, [avisoId])
    const notifId = await enfileirar(avisoId, {
      telefoneAlvo: '+5511999998888', alvoPapel: 'devedor', tipo: 'encerramento',
    })
    const whats = clienteWhatsFake(() => ({ wamid: 'w_enc' }))
    await processarNotificacoesCobrador({ pool: poolZap, logger, whats, appUrl: APP_URL })
    expect(whats.enviadas).toHaveLength(1)
    const notif = await lerNotif(notifId)
    expect(notif.status).toBe('enviado')
    await limpar(cobradorId)
  })
})
