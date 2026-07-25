// H10.10: central de notificações. Cobre isolamento por profile, filtro de categoria
// (só pagamento_informado/combinado_dado_incorreto da outbox de cobrador + recarga da
// outbox de billing entram; outros TipoNotificacao, ex. optout, NUNCA vazam), paginação
// e a marcação de lida POR ITEM (idempotente, sem marcar em massa).
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
    expect(b.total).toBe(3)
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

  it('pagina o feed (page/per_page) sem afastar a contagem de não lidas', async () => {
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
    const r = await app.inject({ method: 'GET', url: '/v1/notificacoes?page=1&per_page=2', headers: AUTH })
    await app.close()
    const b = r.json()
    expect(b.itens).toHaveLength(2)
    expect(b.total).toBe(5)
    expect(b.page).toBe(1)
    expect(b.per_page).toBe(2)
    // nao_lidas segue contando TODAS as pendentes, não só as da página atual.
    expect(b.nao_lidas).toBe(5)

    const app2 = await appA()
    const r2 = await app2.inject({ method: 'GET', url: '/v1/notificacoes?page=3&per_page=2', headers: AUTH })
    await app2.close()
    expect(r2.json().itens).toHaveLength(1)
  })

  it('marcar-lida marca só o item clicado, é idempotente e não vaza notificação de outro dono', async () => {
    const avisoId = await criarAviso(userA, '+5511900001004')
    const idPagamento = await inserirNotifCobrador({ avisoId, cobradorId: userA, tipo: 'pagamento_informado', criadoEm: '2026-07-20T10:00:00Z' })
    await inserirNotifCobrador({ avisoId, cobradorId: userA, tipo: 'combinado_dado_incorreto', criadoEm: '2026-07-20T11:00:00Z' })
    const idRecarga = await inserirNotifBilling({ profileId: userA, telefone: '+5511900001004', criadoEm: '2026-07-20T12:00:00Z' })

    const app1 = await appA()
    const marcar1 = await app1.inject({ method: 'POST', url: `/v1/notificacoes/${idPagamento}/marcar-lida`, headers: AUTH })
    await app1.close()
    expect(marcar1.statusCode).toBe(200)
    expect(marcar1.json()).toEqual({ lida: true })

    const app2 = await appA()
    const depois = await app2.inject({ method: 'GET', url: '/v1/notificacoes', headers: AUTH })
    await app2.close()
    const b = depois.json()
    // Só o item marcado caiu do contador; os outros dois continuam pendentes.
    expect(b.nao_lidas).toBe(2)
    const marcado = b.itens.find((i: { id: string }) => i.id === idPagamento)
    expect(marcado.lida).toBe(true)
    const dadoIncorreto = b.itens.find((i: { tipo: string }) => i.tipo === 'combinado_dado_incorreto')
    expect(dadoIncorreto.lida).toBe(false)

    // Idempotente: marcar de novo o mesmo item não falha nem quebra a contagem.
    const app3 = await appA()
    const marcar2 = await app3.inject({ method: 'POST', url: `/v1/notificacoes/${idPagamento}/marcar-lida`, headers: AUTH })
    await app3.close()
    expect(marcar2.statusCode).toBe(200)
    expect(marcar2.json()).toEqual({ lida: true })

    // Marca a de billing também, isolado da de cobrador (tabelas diferentes).
    const app4 = await appA()
    const marcarBilling = await app4.inject({ method: 'POST', url: `/v1/notificacoes/${idRecarga}/marcar-lida`, headers: AUTH })
    await app4.close()
    expect(marcarBilling.json()).toEqual({ lida: true })

    // B tentando marcar um id de A: não falha, mas não marca (isolamento, sem vazar
    // se o id existe em outra conta).
    const appB = await criarAppTeste(userB)
    const tentativaB = await appB.inject({ method: 'POST', url: `/v1/notificacoes/${idPagamento}/marcar-lida`, headers: AUTH })
    await appB.close()
    expect(tentativaB.statusCode).toBe(200)

    const app5 = await appA()
    const depoisB = await app5.inject({ method: 'GET', url: '/v1/notificacoes', headers: AUTH })
    await app5.close()
    // A notificação de A segue lida por A, intocada pela tentativa de B.
    const aindaMarcado = depoisB.json().itens.find((i: { id: string }) => i.id === idPagamento)
    expect(aindaMarcado.lida).toBe(true)
  })
})
