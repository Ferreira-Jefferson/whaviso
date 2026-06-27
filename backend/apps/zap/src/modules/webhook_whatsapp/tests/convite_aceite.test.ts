// E5 (Convite & Aceite pelo WhatsApp): localização por número+telefone, anti-brute-force,
// telefone divergente, expiração, terminal, dado incorreto. Integração com whaviso_dev.
import { afterEach, afterAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { sha256ConviteHex } from '@whaviso/shared/contracts'
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
  await poolSuper.query(`delete from public.convite_tentativas_telefone`)
  usados = []
})

/** Cria um convite (aguardando_aceite) com número de convite (hash) e telefone-alvo. */
async function criarConvite(opts: {
  numero?: string
  telefoneDevedor?: string
  direcao?: 'receber' | 'pagar'
  expiraEm?: string // SQL interval expr ou timestamptz; default +7d
  pixChave?: string
}): Promise<{ cobradorId: string; avisoId: string; numero: string }> {
  const cobradorId = randomUUID()
  usados.push(cobradorId)
  await poolSuper.query(`insert into auth.users (id) values ($1)`, [cobradorId])
  await poolSuper.query(`update public.profiles set nome='Cobrador' where id=$1`, [cobradorId])
  const numero = opts.numero ?? '123456'
  const tel = opts.telefoneDevedor ?? '+5511999998888'
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.avisos
       (cobrador_id, direcao, criador_papel, status, nome_devedor, telefone_devedor,
        motivo, valor_centavos, data_combinada, pix_chave, convite_hash, convite_expira_em)
     values ($1,'receber','cobrador','aguardando_aceite','Maria',$2,'mensalidade',9900,
             '2026-12-15',$3,$4, now() + interval '7 days')
     returning id`,
    [cobradorId, tel, opts.pixChave ?? 'cobrador@pix.com', sha256ConviteHex(numero)],
  )
  return { cobradorId, avisoId: rows[0]!.id, numero }
}

function texto(telefone: string, t: string) {
  return { wamid: 'w_' + Math.random(), telefone, texto: t }
}

async function contarTentativa(telefone: string): Promise<{ erros: number; bloqueado: boolean } | null> {
  const { rows } = await poolSuper.query(
    `select erros, bloqueado from public.convite_tentativas_telefone where telefone=$1`,
    [telefone],
  )
  return rows[0] ?? null
}

describe('E5 H5.1/H5.2: localizar pelo número + resumo + botões', () => {
  it('número com hífen na frase → resumo com 3 botões; contador zerado', async () => {
    const { avisoId } = await criarConvite({})
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto('5511999998888', 'Oi, aqui é Maria, meu convite é o 123-456'))

    expect(whats.enviadas).toHaveLength(1)
    const m = whats.enviadas[0]!
    expect(m.botoes).toHaveLength(3)
    expect(m.botoes!.map((b) => b.id.split(':')[0])).toEqual(['aceite', 'dado_incorreto', 'recusa'])
    expect(m.botoes!.every((b) => b.id.endsWith(avisoId))).toBe(true) // payload leva aviso_id
    expect(m.texto).toContain('Cobrador') // {{1}} = variável `cobrador` resolvida (rename 0063)
    expect(m.texto.toLowerCase()).not.toMatch(/d[ií]vida|cobran|atras/)
  })

  it('número corrido (xxxxxx) também localiza', async () => {
    await criarConvite({ numero: '777888' })
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto('5511999998888', '777888'))
    expect(whats.enviadas[0]!.botoes).toHaveLength(3)
  })

  it('mensagem sem número de 6 dígitos → pede o número (sem contar tentativa)', async () => {
    await criarConvite({})
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto('5511970009999', 'oi, tudo bem?'))
    expect(whats.enviadas).toHaveLength(1)
    expect(await contarTentativa('+5511970009999')).toBeNull()
  })
})

describe('E5 H5.6/H5.7/G1: terminal e expirado não contam tentativa', () => {
  it('número bate num aviso recusado → informativo, NÃO conta tentativa', async () => {
    const { avisoId } = await criarConvite({ numero: '222333' })
    await poolSuper.query(`update public.avisos set status='recusado' where id=$1`, [avisoId])
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto('5511999998888', 'meu convite é 222-333'))
    expect(whats.enviadas).toHaveLength(1)
    // sem botões (informativo), e contador do telefone NÃO criado/incrementado.
    expect(whats.enviadas[0]!.botoes).toBeUndefined()
    expect(await contarTentativa('+5511999998888')).toBeNull()
  })

  it('convite expirado (convite_expira_em no passado) → informativo expirado', async () => {
    const { avisoId } = await criarConvite({ numero: '444555' })
    await poolSuper.query(`update public.avisos set convite_expira_em = now() - interval '1 day' where id=$1`, [avisoId])
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto('5511999998888', '444555'))
    expect(whats.enviadas).toHaveLength(1)
    expect(whats.enviadas[0]!.botoes).toBeUndefined()
    expect(await contarTentativa('+5511999998888')).toBeNull()
  })
})

describe('E5 H5.8/G6: telefone divergente (não conta, avisa as 2 pontas, não vaza)', () => {
  it('receber: número existe, telefone não bate → notifica criador + resposta neutra', async () => {
    const { avisoId, cobradorId } = await criarConvite({ numero: '321654', pixChave: 'segredo@pix.com' })
    const whats = clienteWhatsFake()
    // Quem responde tem OUTRO telefone (não o telefone_devedor cadastrado).
    await processarTexto({ pool: poolSuper, logger, whats }, texto('5511900001111', 'meu convite é 321-654'))

    // Não consome tentativa (H5.8).
    expect(await contarTentativa('+5511900001111')).toBeNull()
    // Notificou o criador (cobrador) para conferir/reenviar.
    const notif = await poolSuper.query(`select tipo from public.notificacoes_cobrador where aviso_id=$1`, [avisoId])
    expect(notif.rows.map((r: { tipo: string }) => r.tipo)).toContain('convite_telefone_divergente')
    // Resposta ao convidado NÃO revela dado do combinado (sem valor/motivo/Pix).
    expect(whats.enviadas).toHaveLength(1)
    const t = whats.enviadas[0]!.texto
    expect(t).not.toContain('segredo@pix.com')
    expect(t).not.toContain('mensalidade')
    expect(t).not.toContain('99,00')
    void cobradorId
  })

  it('invertido: alvo é telefone_cobrador; divergência não vaza o Pix ao número errado', async () => {
    const devedorId = randomUUID()
    usados.push(devedorId)
    await poolSuper.query(`insert into auth.users (id) values ($1)`, [devedorId])
    await poolSuper.query(`update public.profiles set nome='Devedor', telefone='+5511970005555' where id=$1`, [devedorId])
    const numero = '987654'
    const { rows } = await poolSuper.query<{ id: string }>(
      `insert into public.avisos
         (devedor_profile_id, direcao, criador_papel, status, nome_devedor, telefone_devedor,
          nome_cobrador, telefone_cobrador, motivo, valor_centavos, data_combinada, pix_chave,
          convite_hash, convite_expira_em)
       values ($1,'pagar','devedor','aguardando_aceite','Devedor','+5511970005555',
               'Cobrador','+5511960005555','aluguel',5000,'2026-12-15','pix-secreto@x.com',
               $2, now() + interval '7 days')
       returning id`,
      [devedorId, sha256ConviteHex(numero)],
    )
    const avisoId = rows[0]!.id
    const whats = clienteWhatsFake()
    // Telefone errado (nem cobrador nem devedor).
    await processarTexto({ pool: poolSuper, logger, whats }, texto('5511900003333', '987654'))
    expect(await contarTentativa('+5511900003333')).toBeNull()
    expect(whats.enviadas[0]!.texto).not.toContain('pix-secreto@x.com')
    const notif = await poolSuper.query(`select tipo from public.notificacoes_cobrador where aviso_id=$1`, [avisoId])
    expect(notif.rows.map((r: { tipo: string }) => r.tipo)).toContain('convite_telefone_divergente')
  })

  it('invertido: cobrador certo (telefone_cobrador) recebe resumo COM a chave Pix', async () => {
    const devedorId = randomUUID()
    usados.push(devedorId)
    await poolSuper.query(`insert into auth.users (id) values ($1)`, [devedorId])
    await poolSuper.query(`update public.profiles set nome='Devedor', telefone='+5511970006666' where id=$1`, [devedorId])
    const numero = '111222'
    await poolSuper.query(
      `insert into public.avisos
         (devedor_profile_id, direcao, criador_papel, status, nome_devedor, telefone_devedor,
          nome_cobrador, telefone_cobrador, motivo, valor_centavos, data_combinada, pix_chave,
          convite_hash, convite_expira_em)
       values ($1,'pagar','devedor','aguardando_aceite','Devedor','+5511970006666',
               'Cobrador','+5511960006666','aluguel',5000,'2026-12-15','chave-visivel@x.com',
               $2, now() + interval '7 days')`,
      [devedorId, sha256ConviteHex(numero)],
    )
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto('5511960006666', '111-222'))
    expect(whats.enviadas[0]!.botoes).toHaveLength(3)
    expect(whats.enviadas[0]!.texto).toContain('chave-visivel@x.com') // cobrador confere o Pix
  })
})

describe('E5 H5.9/G7: anti-brute-force 3 tentativas', () => {
  it('número inexistente conta +1; acerto depois zera o contador', async () => {
    await criarConvite({ numero: '555666', telefoneDevedor: '+5511988887777' })
    const whats = clienteWhatsFake()
    const deps = { pool: poolSuper, logger, whats }
    // 2 erros (não estoura).
    await processarTexto(deps, texto('5511988887777', '000000'))
    await processarTexto(deps, texto('5511988887777', '999999'))
    expect((await contarTentativa('+5511988887777'))!.erros).toBe(2)
    // Acerto zera.
    await processarTexto(deps, texto('5511988887777', '555-666'))
    expect((await contarTentativa('+5511988887777'))!.erros).toBe(0)
  })

  it('3 erros, telefone CADASTRADO (alvo de convite) → regenera número + notifica criador', async () => {
    const { avisoId } = await criarConvite({ numero: '101010', telefoneDevedor: '+5511955554444' })
    const hashAntes = (await poolSuper.query(`select convite_hash from public.avisos where id=$1`, [avisoId])).rows[0].convite_hash
    const whats = clienteWhatsFake()
    const deps = { pool: poolSuper, logger, whats }
    for (const n of ['000001', '000002', '000003']) {
      await processarTexto(deps, texto('5511955554444', n))
    }
    // Regenerou o número (hash mudou) e zerou o contador.
    const hashDepois = (await poolSuper.query(`select convite_hash from public.avisos where id=$1`, [avisoId])).rows[0].convite_hash
    expect(hashDepois).not.toBe(hashAntes)
    expect((await contarTentativa('+5511955554444'))!.erros).toBe(0)
    const notif = await poolSuper.query(`select tipo from public.notificacoes_cobrador where aviso_id=$1`, [avisoId])
    expect(notif.rows.map((r: { tipo: string }) => r.tipo)).toContain('convite_tentativas_esgotadas')
  })

  it('3 erros, telefone NÃO cadastrado → bloqueia (sem notificar criador)', async () => {
    // Sem convite para este telefone.
    const whats = clienteWhatsFake()
    const deps = { pool: poolSuper, logger, whats }
    for (const n of ['000001', '000002', '000003']) {
      await processarTexto(deps, texto('5511911112222', n))
    }
    const t = await contarTentativa('+5511911112222')
    expect(t!.bloqueado).toBe(true)
    // 4ª mensagem segue bloqueada, idempotente.
    await processarTexto(deps, texto('5511911112222', '000004'))
    expect((await contarTentativa('+5511911112222'))!.bloqueado).toBe(true)
  })
})

describe('E5 H5.3/H5.4/H5.5: botões aceite/dado_incorreto/recusa pelo fallback numerado', () => {
  it('fallback "2" (dado incorreto) não muda status, notifica criador, segue aguardando_aceite', async () => {
    const { avisoId } = await criarConvite({ numero: '424242', telefoneDevedor: '+5511933332222' })
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
    expect(notif.rows.map((r: { tipo: string }) => r.tipo)).toContain('convite_dado_incorreto')
  })

  it('fallback "1" (aceitar) → programado + 4 envios + notifica criador', async () => {
    const { avisoId } = await criarConvite({ numero: '434343', telefoneDevedor: '+5511933331111' })
    const whats = clienteWhatsFake()
    await processarTexto({ pool: poolSuper, logger, whats }, texto('5511933331111', '1'))
    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('programado')
    const envios = await poolSuper.query(`select count(*)::int as n from public.envios where aviso_id=$1`, [avisoId])
    expect(envios.rows[0].n).toBe(4)
  })

  it('toque DUPLO no botão "Aceitar" é idempotente (não duplica envios nem confirmação)', async () => {
    const { avisoId } = await criarConvite({ numero: '454545', telefoneDevedor: '+5511933339999' })
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
    const { avisoId } = await criarConvite({ numero: '565656', telefoneDevedor: '+5511944443333' })
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
    const { avisoId } = await criarConvite({ numero: '676767', telefoneDevedor: '+5511944442222' })
    const whats = clienteWhatsFake()
    // deps SEM admin (null): comportamento anterior, vínculo só por telefone.
    const deps = { pool: poolSuper, logger, whats, admin: null }
    await processarBotao(deps, { wamid: 'w1', telefone: '+5511944442222', buttonId: `aceite:${avisoId}` })
    const a = await poolSuper.query(`select status, devedor_profile_id from public.avisos where id=$1`, [avisoId])
    expect(a.rows[0].status).toBe('programado')
    expect(a.rows[0].devedor_profile_id).toBeNull()
  })
})
