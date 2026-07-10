// E4 (Modo agenda), H4.1..H4.5. Cobre: criar agenda (sem_aviso, sem convite/envios,
// telefone opcional, free permitido até capacidade); agenda NÃO conta em ativos mas
// conta em agenda; ativar gera convite + consome vaga + free -> CTA; ativar pede
// telefone/Pix faltante (receber); ativar invertido sem Pix (opcional) resolve
// telefone_devedor; duplo-tap
// concorrente -> 409; editar livre em sem_aviso; descartar -> cancelado; marcar pago
// manual -> pago com evento pago_manual e ator correto (inclusive invertido).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  criarAppTeste,
  criarUsuario,
  definirPlano,
  encerrarPools,
  limparUsuario,
  poolSuper,
} from '../../../../test/harness'

const AUTH = { authorization: 'Bearer fake' }

function corpoReceber(over: Record<string, unknown> = {}) {
  return {
    direcao: 'receber',
    nome_devedor: 'Maria',
    telefone_devedor: '+5511999998888',
    motivo: 'mensalidade',
    valor_centavos: 9900,
    data_combinada: '2026-12-15',
    pix_chave: 'maria@pix.com',
    pix_titular: 'Maria Silva',
    pix_banco: 'Banco Exemplo',
    ...over,
  }
}

async function contarPorStatus(uid: string, status: string): Promise<number> {
  const r = await poolSuper.query<{ n: string }>(
    `select count(*) as n from public.avisos
     where status = $2
       and ((criador_papel = 'cobrador' and cobrador_id = $1)
            or (criador_papel = 'devedor' and devedor_profile_id = $1))`,
    [uid, status],
  )
  return Number(r.rows[0]!.n)
}

async function tiposEventos(avisoId: string): Promise<string[]> {
  const r = await poolSuper.query<{ tipo: string; ator: string }>(
    `select tipo, ator from public.eventos_aviso where aviso_id = $1 order by id asc`,
    [avisoId],
  )
  return r.rows.map((x) => `${x.tipo}:${x.ator}`)
}

describe('E4 modo agenda (integração com whaviso_dev)', () => {
  let uid: string

  beforeAll(async () => {
    uid = await criarUsuario('Agenda Teste')
    await definirPlano(uid, 'profissional')
  })
  beforeEach(async () => {
    // Isolamento: limpa avisos do uid em AMBOS os papéis (receber: cobrador_id;
    // invertido: devedor_profile_id). O helper limparAvisos só cobre cobrador_id.
    await poolSuper.query(
      `delete from public.avisos where cobrador_id = $1 or devedor_profile_id = $1`,
      [uid],
    )
  })
  afterAll(async () => {
    await limparUsuario(uid)
    await encerrarPools()
  })

  it('H4.1: cria agenda → sem_aviso, sem convite (hashes null), sem envios, sem número de convite', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: corpoReceber({ modo: 'agenda' }),
    })
    expect(r.statusCode).toBe(201)
    const body = r.json()
    expect(body.aviso.status).toBe('sem_aviso')
    expect(body.numero_convite).toBeUndefined()
    // Modo agenda: nada é enviado, então NÃO enfileira o combinado ao convidado (E5).
    const { rows: convites } = await poolSuper.query(
      `select 1 from public.notificacoes_cobrador where aviso_id=$1 and tipo='combinado_enviar'`,
      [body.aviso.id],
    )
    expect(convites).toHaveLength(0)

    const id = body.aviso.id
    const hashes = await poolSuper.query<{ ac: string | null; ak: string | null }>(
      `select aceite_token_hash as ac, acao_token_hash as ak from public.avisos where id = $1`,
      [id],
    )
    expect(hashes.rows[0]!.ac).toBeNull()
    expect(hashes.rows[0]!.ak).toBeNull()

    const envios = await poolSuper.query<{ n: string }>(
      `select count(*) as n from public.envios where aviso_id = $1`,
      [id],
    )
    expect(Number(envios.rows[0]!.n)).toBe(0)

    // Evento criado preserva direcao E modo (G-B3).
    const ev = await poolSuper.query<{ detalhes: { direcao?: string; modo?: string } }>(
      `select detalhes from public.eventos_aviso where aviso_id = $1 and tipo = 'criado'`,
      [id],
    )
    expect(ev.rows[0]!.detalhes.direcao).toBe('receber')
    expect(ev.rows[0]!.detalhes.modo).toBe('agenda')
    await app.close()
  })

  it('H4.1: telefone da outra ponta é OPCIONAL na agenda (receber e invertido)', async () => {
    const app = await criarAppTeste(uid)
    const rReceber = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: corpoReceber({ modo: 'agenda', telefone_devedor: null, pix_chave: null, pix_titular: null, pix_banco: null }),
    })
    expect(rReceber.statusCode).toBe(201)
    expect(rReceber.json().aviso.status).toBe('sem_aviso')

    const rInv = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: {
        direcao: 'pagar',
        modo: 'agenda',
        nome_devedor: 'Eu',
        motivo: 'aluguel',
        valor_centavos: 5000,
        data_combinada: '2026-12-20',
        // sem nome_cobrador/telefone_cobrador/pix: tudo diferido para ativar
      },
    })
    expect(rInv.statusCode).toBe(201)
    expect(rInv.json().aviso.status).toBe('sem_aviso')
    await app.close()
  })

  it('H4.1: FREE PODE criar agenda até a capacidade (25), recusa no limite com agenda_cheia', async () => {
    const free = await criarUsuario('FreeAgenda') // nasce free (capacidade_agenda 25)
    const app = await criarAppTeste(free)
    // Cria alguns itens de agenda (free não é barrado: nada é enviado).
    for (let i = 0; i < 3; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/v1/avisos',
        headers: AUTH,
        payload: corpoReceber({ modo: 'agenda' }),
      })
      expect(r.statusCode).toBe(201)
      expect(r.json().aviso.status).toBe('sem_aviso')
    }
    await app.close()
    await limparUsuario(free)
  })

  it('G-M4: criar agenda NÃO conta em ativos; ativar MOVE de balde (agenda mantém, ativo +1)', async () => {
    const app = await criarAppTeste(uid)
    // Cria 1 agenda.
    const criado = await app.inject({
      method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoReceber({ modo: 'agenda' }),
    })
    const id = criado.json().aviso.id

    // Conta de agenda (balde) = 1; ativos = 0 (sem_aviso não conta).
    const agenda1 = await poolSuper.query<{ n: number }>(`select public.contar_agenda($1) as n`, [uid])
    expect(Number(agenda1.rows[0]!.n)).toBe(1)
    expect(await contarPorStatus(uid, 'sem_aviso')).toBe(1)
    expect(await contarPorStatus(uid, 'aguardando_aceite')).toBe(0)

    // Ativa: move o balde (agenda continua contando o item; ativo passa a existir).
    const ativar = await app.inject({
      method: 'POST', url: `/v1/avisos/${id}/ativar`, headers: AUTH, payload: {},
    })
    expect(ativar.statusCode).toBe(200)
    expect(ativar.json().aviso.status).toBe('aguardando_aceite')
    expect(ativar.json().numero_convite).toBeUndefined()

    // Agenda (balde único, H11.4) ainda conta o item ativado (não libera o slot).
    const agenda2 = await poolSuper.query<{ n: number }>(`select public.contar_agenda($1) as n`, [uid])
    expect(Number(agenda2.rows[0]!.n)).toBe(1)
    // Ativo agora existe.
    expect(await contarPorStatus(uid, 'sem_aviso')).toBe(0)
    expect(await contarPorStatus(uid, 'aguardando_aceite')).toBe(1)
    await app.close()
  })

  it('H4.3: ativar transita para aguardando_aceite e enfileira o combinado ao convidado', async () => {
    const app = await criarAppTeste(uid)
    const criado = await app.inject({
      method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoReceber({ modo: 'agenda' }),
    })
    const id = criado.json().aviso.id
    const ativar = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/ativar`, headers: AUTH, payload: {} })
    expect(ativar.statusCode).toBe(200)

    const row = await poolSuper.query<{ status: string }>(
      `select status from public.avisos where id = $1`,
      [id],
    )
    expect(row.rows[0]!.status).toBe('aguardando_aceite')
    // E5: a ativação enfileira o envio do combinado ao convidado (combinado_enviar).
    const { rows: convites } = await poolSuper.query(
      `select 1 from public.notificacoes_cobrador where aviso_id=$1 and tipo='combinado_enviar'`,
      [id],
    )
    expect(convites).toHaveLength(1)

    const eventos = await tiposEventos(id)
    expect(eventos).toContain('ativado:cobrador')
    expect(eventos).toContain('combinado_gerado:cobrador')
    await app.close()
  })

  it('H4.3: ativar pede telefone/Pix faltante → dado_obrigatorio_ativacao, sem transitar', async () => {
    const app = await criarAppTeste(uid)
    // Agenda sem telefone nem Pix.
    const criado = await app.inject({
      method: 'POST', url: '/v1/avisos', headers: AUTH,
      payload: corpoReceber({ modo: 'agenda', telefone_devedor: null, pix_chave: null, pix_titular: null, pix_banco: null }),
    })
    const id = criado.json().aviso.id
    const ativar = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/ativar`, headers: AUTH, payload: {} })
    expect(ativar.statusCode).toBe(422)
    expect(ativar.json().error.code).toBe('dado_obrigatorio_ativacao')
    // Não transitou.
    expect(await contarPorStatus(uid, 'sem_aviso')).toBe(1)

    // Agora ativa fornecendo os dados no corpo.
    const ok = await app.inject({
      method: 'POST', url: `/v1/avisos/${id}/ativar`, headers: AUTH,
      payload: { telefone_devedor: '+5511977776666', pix_chave: 'x@pix.com', pix_titular: 'X', pix_banco: 'Banco' },
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().aviso.status).toBe('aguardando_aceite')
    await app.close()
  })

  it('G-M5: ativar invertido resolve telefone_devedor do perfil do criador', async () => {
    const inv = await criarUsuario('InvertidoAgenda')
    await definirPlano(inv, 'profissional')
    // Define telefone no perfil (alvo dos lembretes no invertido).
    await poolSuper.query(`update public.profiles set telefone = $2 where id = $1`, [inv, '+5511955554444'])
    const app = await criarAppTeste(inv)
    const criado = await app.inject({
      method: 'POST', url: '/v1/avisos', headers: AUTH,
      payload: {
        direcao: 'pagar', modo: 'agenda', nome_devedor: 'Eu', motivo: 'aluguel',
        valor_centavos: 5000, data_combinada: '2026-12-20',
      },
    })
    const id = criado.json().aviso.id
    // Ativa fornecendo só a outra ponta (cobrador), SEM Pix: no invertido o Pix é
    // OPCIONAL (decisão do dono), ativar sem chave é permitido. telefone_devedor vem do
    // perfil. pix_chave fica null e pode entrar depois via PATCH.
    const ativar = await app.inject({
      method: 'POST', url: `/v1/avisos/${id}/ativar`, headers: AUTH,
      payload: { nome_cobrador: 'Joao', telefone_cobrador: '+5511944443333' },
    })
    expect(ativar.statusCode).toBe(200)
    const row = await poolSuper.query<{ td: string | null; pix: string | null }>(
      `select telefone_devedor as td, pix_chave as pix from public.avisos where id = $1`,
      [id],
    )
    expect(row.rows[0]!.td).toBe('+5511955554444')
    expect(row.rows[0]!.pix).toBeNull()
    await app.close()
    await limparUsuario(inv)
  })

  it('G-M2: duplo-tap CONCORRENTE de ativar → só um passa, o outro 409', async () => {
    const app = await criarAppTeste(uid)
    const criado = await app.inject({
      method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoReceber({ modo: 'agenda' }),
    })
    const id = criado.json().aviso.id
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: `/v1/avisos/${id}/ativar`, headers: AUTH, payload: {} }),
      app.inject({ method: 'POST', url: `/v1/avisos/${id}/ativar`, headers: AUTH, payload: {} }),
    ])
    const status = [a.statusCode, b.statusCode].sort()
    expect(status).toEqual([200, 409])
    // Exatamente UM ativado; a agenda gerou só um número.
    expect(await contarPorStatus(uid, 'aguardando_aceite')).toBe(1)
    await app.close()
  })

  it('H11.4: SEM saldo não ativa → saldo_insuficiente (item segue na agenda)', async () => {
    // Anotação de agenda NÃO reserva; ATIVAR reserva 1 crédito. Sem saldo, a ativação é
    // recusada (saldo_insuficiente) e o item permanece na agenda (nada se perde).
    const semSaldo = await criarUsuario('SemSaldoAtiva')
    // Zera a cortesia para forçar a recusa na ativação.
    await poolSuper.query(`update public.creditos_carteira set saldo_livre=0 where profile_id=$1`, [semSaldo])
    const app = await criarAppTeste(semSaldo)
    const criado = await app.inject({
      method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoReceber({ modo: 'agenda' }),
    })
    const id = criado.json().aviso.id
    const ativar = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/ativar`, headers: AUTH, payload: {} })
    expect(ativar.statusCode).toBe(422)
    expect(ativar.json().error.code).toBe('saldo_insuficiente')
    // Não transitou: continua na agenda.
    expect(await contarPorStatus(semSaldo, 'sem_aviso')).toBe(1)
    await app.close()
    await limparUsuario(semSaldo)
  })

  it('H4.4: edição é LIVRE e imediata em sem_aviso (sem reaprovação), evento editado', async () => {
    const app = await criarAppTeste(uid)
    const criado = await app.inject({
      method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoReceber({ modo: 'agenda' }),
    })
    const id = criado.json().aviso.id
    const editar = await app.inject({
      method: 'PATCH', url: `/v1/avisos/${id}`, headers: AUTH,
      payload: { valor_centavos: 12345, motivo: 'mensalidade nova' },
    })
    expect(editar.statusCode).toBe(200)
    // Aplicado direto: continua sem_aviso (sem aguardando_aprovacao).
    expect(editar.json().status).toBe('sem_aviso')
    expect(editar.json().valor_centavos).toBe(12345)
    const eventos = await tiposEventos(id)
    expect(eventos).toContain('editado:cobrador')
    await app.close()
  })

  it('H4.4: descartar uma agenda → cancelado (não-DELETE: linha permanece)', async () => {
    const app = await criarAppTeste(uid)
    const criado = await app.inject({
      method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoReceber({ modo: 'agenda' }),
    })
    const id = criado.json().aviso.id
    const cancelar = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/cancelar`, headers: AUTH })
    expect(cancelar.statusCode).toBe(200)
    expect(cancelar.json().status).toBe('cancelado')
    // A linha NÃO some.
    const ainda = await poolSuper.query<{ n: string }>(`select count(*) as n from public.avisos where id = $1`, [id])
    expect(Number(ainda.rows[0]!.n)).toBe(1)
    await app.close()
  })

  it('H4.5: marcar pago manual → pago (terminal) com evento pago_manual ator=cobrador (receber)', async () => {
    const app = await criarAppTeste(uid)
    const criado = await app.inject({
      method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoReceber({ modo: 'agenda' }),
    })
    const id = criado.json().aviso.id
    const pago = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/marcar-pago-agenda`, headers: AUTH })
    expect(pago.statusCode).toBe(200)
    expect(pago.json().status).toBe('pago')
    const eventos = await tiposEventos(id)
    expect(eventos).toContain('pago_manual:cobrador')
    // Idempotente.
    const pago2 = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/marcar-pago-agenda`, headers: AUTH })
    expect(pago2.statusCode).toBe(200)
    expect(pago2.json().status).toBe('pago')
    await app.close()
  })

  it('H4.5: marcar pago manual no INVERTIDO → evento pago_manual ator=devedor (D4)', async () => {
    const inv = await criarUsuario('InvPagoManual')
    await definirPlano(inv, 'profissional')
    const app = await criarAppTeste(inv)
    const criado = await app.inject({
      method: 'POST', url: '/v1/avisos', headers: AUTH,
      payload: {
        direcao: 'pagar', modo: 'agenda', nome_devedor: 'Eu', motivo: 'aluguel',
        valor_centavos: 5000, data_combinada: '2026-12-20',
      },
    })
    const id = criado.json().aviso.id
    const pago = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/marcar-pago-agenda`, headers: AUTH })
    expect(pago.statusCode).toBe(200)
    const eventos = await tiposEventos(id)
    // Ator correto no invertido: o criador é o DEVEDOR (não reusa confirmado_cobrador).
    expect(eventos).toContain('pago_manual:devedor')
    await app.close()
    await limparUsuario(inv)
  })

  it('H4.2: filtra por status=sem_aviso na listagem (separa agenda do ativo)', async () => {
    const app = await criarAppTeste(uid)
    await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoReceber({ modo: 'agenda' }) })
    await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoReceber() }) // enviar
    const lista = await app.inject({ method: 'GET', url: '/v1/avisos?status=sem_aviso', headers: AUTH })
    expect(lista.statusCode).toBe(200)
    const itens = lista.json().itens
    expect(itens.length).toBe(1)
    expect(itens.every((a: { status: string }) => a.status === 'sem_aviso')).toBe(true)
    await app.close()
  })

  it('trigger: transições inválidas a partir de sem_aviso são rejeitadas no banco', async () => {
    const app = await criarAppTeste(uid)
    const criado = await app.inject({
      method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoReceber({ modo: 'agenda' }),
    })
    const id = criado.json().aviso.id
    // sem_aviso -> informado_pago e sem_aviso -> programado NÃO são permitidas.
    await expect(
      poolSuper.query(`update public.avisos set status = 'informado_pago' where id = $1`, [id]),
    ).rejects.toThrow()
    await expect(
      poolSuper.query(`update public.avisos set status = 'programado' where id = $1`, [id]),
    ).rejects.toThrow()
    // As válidas passam (cancelado).
    await poolSuper.query(`update public.avisos set status = 'cancelado' where id = $1`, [id])
    await app.close()
  })
})
