// Roteamento do enfileirador generalizado (E10a): resolve o ALVO (criador do
// combinado) por papel e por canal (conta vs telefone), e a idempotência por
// dedupe_key. Banco real (whaviso_dev) via superusuário (fixtures) + cliente api.
import { afterAll, describe, expect, it } from 'vitest'
import { enfileirarNotificacao } from '../index'
import { criarUsuario, encerrarPools, limparUsuario, poolApi, poolSuper } from '../../../../test/harness'

async function criarAviso(over: {
  criador_papel: 'cobrador' | 'devedor'
  cobrador_id?: string | null
  devedor_profile_id?: string | null
  telefone_cobrador?: string | null
  telefone_devedor?: string | null
  direcao?: 'receber' | 'pagar'
}): Promise<string> {
  const direcao = over.direcao ?? (over.criador_papel === 'cobrador' ? 'receber' : 'pagar')
  // Constraint avisos_convite_tem_destino (0017): receber exige telefone_devedor.
  const telDevedor = over.telefone_devedor ?? (direcao === 'receber' ? '+5511999998888' : null)
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.avisos
       (cobrador_id, devedor_profile_id, direcao, criador_papel, status,
        nome_devedor, telefone_devedor, nome_cobrador, telefone_cobrador,
        motivo, valor_centavos, data_combinada, pix_chave)
     values ($1,$2,$3,$4,'informado_pago','Maria',$5,'Cobrador',$6,'mensalidade',9900,'2026-12-15','cobrador@pix.com')
     returning id`,
    [
      over.cobrador_id ?? null,
      over.devedor_profile_id ?? null,
      direcao,
      over.criador_papel,
      telDevedor,
      over.telefone_cobrador ?? null,
    ],
  )
  return rows[0]!.id
}

async function alvoDa(avisoId: string): Promise<{ alvo_papel: string; cobrador_id: string | null; telefone_alvo: string | null } | null> {
  const { rows } = await poolSuper.query(
    `select alvo_papel, cobrador_id, telefone_alvo from public.notificacoes_cobrador
     where aviso_id=$1 and status<>'cancelado' order by criado_em desc limit 1`,
    [avisoId],
  )
  return rows[0] ?? null
}

async function enfileirarVia(avisoId: string): Promise<{ enfileirado: boolean }> {
  const { rows } = await poolApi.query<{
    id: string
    criador_papel: 'cobrador' | 'devedor'
    cobrador_id: string | null
    devedor_profile_id: string | null
    telefone_cobrador: string | null
    telefone_devedor: string | null
  }>(
    `select id, criador_papel, cobrador_id, devedor_profile_id, telefone_cobrador, telefone_devedor
     from public.avisos where id=$1`,
    [avisoId],
  )
  const cli = await poolApi.connect()
  try {
    return await enfileirarNotificacao(cli, rows[0]!, 'pagamento_informado')
  } finally {
    cli.release()
  }
}

afterAll(async () => {
  await encerrarPools()
})

describe('enfileirador generalizado: roteamento por alvo', () => {
  it('receber COM conta: alvo = cobrador (cobrador_id)', async () => {
    const cobrador = await criarUsuario('Cob')
    const avisoId = await criarAviso({ criador_papel: 'cobrador', cobrador_id: cobrador })
    const r = await enfileirarVia(avisoId)
    expect(r.enfileirado).toBe(true)
    const alvo = await alvoDa(avisoId)
    expect(alvo).toMatchObject({ alvo_papel: 'cobrador', cobrador_id: cobrador, telefone_alvo: null })
    await limparUsuario(cobrador)
  })

  it('receber SEM conta: alvo = cobrador por telefone_cobrador', async () => {
    const avisoId = await criarAviso({ criador_papel: 'cobrador', cobrador_id: null, telefone_cobrador: '+5511955554444' })
    const r = await enfileirarVia(avisoId)
    expect(r.enfileirado).toBe(true)
    const alvo = await alvoDa(avisoId)
    expect(alvo).toMatchObject({ alvo_papel: 'cobrador', cobrador_id: null, telefone_alvo: '+5511955554444' })
    await poolSuper.query(`delete from public.avisos where id=$1`, [avisoId])
  })

  it('invertido COM conta: alvo = devedor-criador (devedor_profile_id)', async () => {
    const devedor = await criarUsuario('Dev')
    const avisoId = await criarAviso({
      criador_papel: 'devedor',
      cobrador_id: null,
      devedor_profile_id: devedor,
      telefone_cobrador: '+5511960002222',
    })
    const r = await enfileirarVia(avisoId)
    expect(r.enfileirado).toBe(true)
    const alvo = await alvoDa(avisoId)
    expect(alvo).toMatchObject({ alvo_papel: 'devedor', cobrador_id: devedor, telefone_alvo: null })
    await limparUsuario(devedor)
  })

  it('invertido SEM conta do devedor: alvo = devedor por telefone_devedor', async () => {
    const avisoId = await criarAviso({
      criador_papel: 'devedor',
      cobrador_id: null,
      devedor_profile_id: null,
      telefone_devedor: '+5511970001111',
      telefone_cobrador: '+5511960002222',
    })
    const r = await enfileirarVia(avisoId)
    expect(r.enfileirado).toBe(true)
    const alvo = await alvoDa(avisoId)
    expect(alvo).toMatchObject({ alvo_papel: 'devedor', cobrador_id: null, telefone_alvo: '+5511970001111' })
    await poolSuper.query(`delete from public.avisos where id=$1`, [avisoId])
  })

  it('sem alvo possível (sem conta e sem telefone): NÃO enfileira', async () => {
    const avisoId = await criarAviso({ criador_papel: 'cobrador', cobrador_id: null, telefone_cobrador: null })
    const r = await enfileirarVia(avisoId)
    expect(r.enfileirado).toBe(false)
    expect(await alvoDa(avisoId)).toBeNull()
    await poolSuper.query(`delete from public.avisos where id=$1`, [avisoId])
  })
})
