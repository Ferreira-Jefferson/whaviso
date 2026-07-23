// H10.10: central de notificações. Cobre isolamento por profile, filtro de categoria
// (só pagamento_informado/combinado_dado_incorreto da outbox de cobrador + recarga da
// outbox de billing entram; outros TipoNotificacao, ex. optout, NUNCA vazam) e a
// marcação como lida (idempotente).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  criarAppTeste,
  criarUsuario,
  encerrarPools,
  limparUsuario,
  poolSuper,
} from '../../../../test/harness'

const AUTH = { authorization: 'Bearer u' }

async function criarAviso(cobradorId: string, telefoneDevedor: string): Promise<string> {
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.avisos
       (cobrador_id, direcao, criador_papel, status, nome_devedor, telefone_devedor,
        pix_chave, motivo, valor_centavos, data_combinada)
     values ($1,'receber','cobrador','informado_pago',$2,$3,'c@pix.com','pedido',10000,'2026-07-01')
     returning id`,
    [cobradorId, 'Devedor', telefoneDevedor],
  )
  return rows[0]!.id
}

async function inserirNotifCobrador(args: {
  avisoId: string
  cobradorId: string
  tipo: string
  criadoEm: string
}): Promise<string> {
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.notificacoes_cobrador (aviso_id, cobrador_id, tipo, alvo_papel, criado_em)
     values ($1,$2,$3,'cobrador',$4::timestamptz)
     returning id`,
    [args.avisoId, args.cobradorId, args.tipo, args.criadoEm],
  )
  return rows[0]!.id
}

async function inserirNotifBilling(args: {
  profileId: string
  telefone: string
  criadoEm: string
}): Promise<string> {
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.notificacoes_billing
       (profile_id, telefone_alvo, quantidade, valor_centavos, criado_em)
     values ($1,$2,50,9900,$3::timestamptz)
     returning id`,
    [args.profileId, args.telefone, args.criadoEm],
  )
  return rows[0]!.id
}

describe('notificacoes: central (H10.10)', () => {
  let userA: string
  let userB: string

  async function appA() {
    return criarAppTeste(userA)
  }

  beforeAll(async () => {
    userA = await criarUsuario('Cobradora A')
    userB = await criarUsuario('Cobradora B')
  })
  beforeEach(async () => {
    await poolSuper.query('delete from public.avisos where cobrador_id = any($1)', [[userA, userB]])
    await poolSuper.query('delete from public.notificacoes_billing where profile_id = any($1)', [
      [userA, userB],
    ])
  })
  afterAll(async () => {
    await limparUsuario(userA)
    await limparUsuario(userB)
    await encerrarPools()
  })

  it('sem token → 401', async () => {
    const app = await appA()
    const r = await app.inject({ method: 'GET', url: '/v1/notificacoes' })
    await app.close()
    expect(r.statusCode).toBe(401)
  })

  it('filtra as categorias do escopo: pagamento_informado, combinado_dado_incorreto e recarga aparecem; optout nunca vaza', async () => {
    const avisoId = await criarAviso(userA, '+5511900001001')
    await inserirNotifCobrador({ avisoId, cobradorId: userA, tipo: 'pagamento_informado', criadoEm: '2026-07-20T10:00:00Z' })
    await inserirNotifCobrador({ avisoId, cobradorId: userA, tipo: 'combinado_dado_incorreto', criadoEm: '2026-07-20T11:00:00Z' })
    // Fora de escopo desta leva (H10.10): não deve aparecer na central, mesmo sendo do
    // mesmo usuário/combinado.
    await inserirNotifCobrador({ avisoId, cobradorId: userA, tipo: 'optout', criadoEm: '2026-07-20T12:00:00Z' })
    await inserirNotifBilling({ profileId: userA, telefone: '+5511900001001', criadoEm: '2026-07-20T13:00:00Z' })

    const app = await appA()
    const r = await app.inject({ method: 'GET', url: '/v1/notificacoes', headers: AUTH })
    await app.close()

    expect(r.statusCode).toBe(200)
    const b = r.json()
    expect(b.itens).toHaveLength(3)
    const tipos = b.itens.map((i: { tipo: string }) => i.tipo).sort()
    expect(tipos).toEqual(['combinado_dado_incorreto', 'pagamento_informado', 'recarga'])
    expect(b.itens.every((i: { tipo: string }) => i.tipo !== 'optout')).toBe(true)
    expect(b.nao_lidas).toBe(3)

    // Ordem cronológica decrescente (recarga é a mais recente).
    expect(b.itens[0]).toMatchObject({ tipo: 'recarga', aviso_id: null, lida: false })
    // As de cobrador levam o aviso_id (link para /app/avisos/:id no front).
    const dadoIncorreto = b.itens.find((i: { tipo: string }) => i.tipo === 'combinado_dado_incorreto')
    expect(dadoIncorreto).toMatchObject({ origem: 'cobrador', aviso_id: avisoId, lida: false })
  })

  it('isolamento por profile: B não vê nem conta as notificações de A', async () => {
    const avisoA = await criarAviso(userA, '+5511900001002')
    await inserirNotifCobrador({ avisoId: avisoA, cobradorId: userA, tipo: 'pagamento_informado', criadoEm: '2026-07-20T10:00:00Z' })
    await inserirNotifBilling({ profileId: userA, telefone: '+5511900001002', criadoEm: '2026-07-20T11:00:00Z' })

    const avisoB = await criarAviso(userB, '+5511900001003')
    await inserirNotifCobrador({ avisoId: avisoB, cobradorId: userB, tipo: 'combinado_dado_incorreto', criadoEm: '2026-07-20T12:00:00Z' })

    const appB = await criarAppTeste(userB)
    const r = await appB.inject({ method: 'GET', url: '/v1/notificacoes', headers: AUTH })
    await appB.close()

    expect(r.statusCode).toBe(200)
    const b = r.json()
    expect(b.itens).toHaveLength(1)
    expect(b.itens[0]).toMatchObject({ tipo: 'combinado_dado_incorreto', aviso_id: avisoB })
    expect(b.nao_lidas).toBe(1)
  })

  it('marcar-lidas marca tudo de uma vez e é idempotente', async () => {
    const avisoId = await criarAviso(userA, '+5511900001004')
    await inserirNotifCobrador({ avisoId, cobradorId: userA, tipo: 'pagamento_informado', criadoEm: '2026-07-20T10:00:00Z' })
    await inserirNotifCobrador({ avisoId, cobradorId: userA, tipo: 'combinado_dado_incorreto', criadoEm: '2026-07-20T11:00:00Z' })
    await inserirNotifBilling({ profileId: userA, telefone: '+5511900001004', criadoEm: '2026-07-20T12:00:00Z' })

    const app1 = await appA()
    const marcar1 = await app1.inject({ method: 'POST', url: '/v1/notificacoes/marcar-lidas', headers: AUTH })
    await app1.close()
    expect(marcar1.statusCode).toBe(200)
    expect(marcar1.json()).toEqual({ marcadas: 3 })

    const app2 = await appA()
    const depois = await app2.inject({ method: 'GET', url: '/v1/notificacoes', headers: AUTH })
    await app2.close()
    const b = depois.json()
    expect(b.nao_lidas).toBe(0)
    expect(b.itens.every((i: { lida: boolean }) => i.lida)).toBe(true)

    // Idempotente: reprocessar sem pendentes novas não marca nada de novo, nem quebra.
    const app3 = await appA()
    const marcar2 = await app3.inject({ method: 'POST', url: '/v1/notificacoes/marcar-lidas', headers: AUTH })
    await app3.close()
    expect(marcar2.statusCode).toBe(200)
    expect(marcar2.json()).toEqual({ marcadas: 0 })
  })

  it('respeita o limit da querystring', async () => {
    const avisoId = await criarAviso(userA, '+5511900001005')
    for (let i = 0; i < 5; i++) {
      await inserirNotifCobrador({
        avisoId,
        cobradorId: userA,
        tipo: i % 2 === 0 ? 'pagamento_informado' : 'combinado_dado_incorreto',
        criadoEm: `2026-07-20T${10 + i}:00:00Z`,
      })
    }
    const app = await appA()
    const r = await app.inject({ method: 'GET', url: '/v1/notificacoes?limit=2', headers: AUTH })
    await app.close()
    const b = r.json()
    expect(b.itens).toHaveLength(2)
    // nao_lidas segue contando TODAS as pendentes, não só as retornadas pelo limit.
    expect(b.nao_lidas).toBe(5)
  })
})
