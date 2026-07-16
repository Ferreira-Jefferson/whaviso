import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  aceitarAvisoDireto,
  creditarConta,
  criarAppTeste,
  criarUsuario,
  definirPlano,
  encerrarPools,
  limparAvisos,
  limparUsuario,
  poolSuper,
} from '../../../../test/harness'

const AUTH = { authorization: 'Bearer fake' }
const AUTH_DEVEDOR = { authorization: 'Bearer devedor' }

function corpoAviso(over: Record<string, unknown> = {}) {
  return {
    direcao: 'receber',
    nome_devedor: 'Maria',
    telefone_devedor: '+5511999998888',
    motivo: 'mensalidade',
    itens: [{ descricao: 'Item', qtd: 1, valor_unit_centavos: 9900 }],
    data_combinada: '2026-12-15',
    // H2.1: Pix obrigatório no receber, com titular e banco.
    pix_chave: 'maria@pix.com',
    pix_titular: 'Maria Silva',
    pix_banco: 'Banco Exemplo',
    ...over,
  }
}

// E11: anotação de AGENDA (modo agenda) NÃO reserva crédito; serve para exercitar o teto
// de agenda (balde único) sem esbarrar em saldo. Telefone/Pix são opcionais na agenda.
function corpoAvisoAgenda(over: Record<string, unknown> = {}) {
  return {
    direcao: 'receber',
    modo: 'agenda',
    nome_devedor: 'Maria',
    motivo: 'mensalidade',
    itens: [{ descricao: 'Item', qtd: 1, valor_unit_centavos: 9900 }],
    data_combinada: '2026-12-15',
    ...over,
  }
}

describe('avisos (integração com whaviso_dev)', () => {
  let uid: string

  beforeAll(async () => {
    uid = await criarUsuario('Cobrador Teste')
    // A conta nasce free (somente leitura). Para criar avisos, sobe ao profissional.
    await definirPlano(uid, 'profissional')
  })
  beforeEach(async () => {
    await limparAvisos(uid) // isolamento: cada teste começa sem avisos
  })
  afterAll(async () => {
    await limparUsuario(uid)
  })

  it('sem token → 401', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'POST', url: '/v1/avisos', payload: corpoAviso() })
    expect(r.statusCode).toBe(401)
    expect(r.json().error.code).toBe('nao_autorizado')
    await app.close()
  })

  it('cria aviso (receber) → 201 devolve só o aviso, enfileira o combinado ao devedor, status aguardando_aceite', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    expect(r.statusCode).toBe(201)
    const body = r.json()
    expect(body.aviso.status).toBe('aguardando_aceite')
    // E5: o Whaviso INICIA a conversa mandando o combinado com botões. A api não devolve
    // mais número de convite, link/mensagem para o criador compartilhar.
    expect(body.numero_convite).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('wa.me/')
    expect(JSON.stringify(body)).not.toContain('/aceite/')
    expect(body.mensagem_convite).toBeUndefined()
    expect(body.link_whatsapp).toBeUndefined()
    // E5: enfileirou o combinado (combinado_enviar) ao CONVIDADO (devedor, por telefone)
    // na outbox, para o zap mandar o template combinado.resumo.
    const { rows } = await poolSuper.query(
      `select alvo_papel, cobrador_id, telefone_alvo from public.notificacoes_cobrador
        where aviso_id=$1 and tipo='combinado_enviar'`,
      [body.aviso.id],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].alvo_papel).toBe('devedor')
    expect(rows[0].cobrador_id).toBeNull() // convidado sem conta em aguardando_aceite
    expect(rows[0].telefone_alvo).toBe('+5511999998888')
    await app.close()
  })

  it('cria aviso com itens do pedido (Fase A) → guarda e devolve a composição', async () => {
    const app = await criarAppTeste(uid)
    const itens = [
      { descricao: 'Perfume Essencial', qtd: 2, valor_unit_centavos: 12000 },
      { descricao: 'Batom', qtd: 1, valor_unit_centavos: 3500 },
    ]
    const r = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: corpoAviso({ itens }),
    })
    expect(r.statusCode).toBe(201)
    const criado = r.json().aviso
    expect(criado.itens).toEqual(itens)
    // Persistiu no jsonb: lê de volta pelo detalhe.
    const det = await app.inject({ method: 'GET', url: `/v1/avisos/${criado.id}`, headers: AUTH })
    expect(det.statusCode).toBe(200)
    expect(det.json().itens).toEqual(itens)
    // Itens são INTERNOS: nunca vão ao devedor (não aparecem na notificação enfileirada).
    const { rows } = await poolSuper.query(
      `select * from public.notificacoes_cobrador where aviso_id=$1 and tipo='combinado_enviar'`,
      [criado.id],
    )
    expect(JSON.stringify(rows)).not.toContain('Perfume Essencial')
    await app.close()
  })

  it('cria invertido (pagar) em modo enviar SEM Pix → 201 (Pix opcional no invertido)', async () => {
    // Decisão do dono (sobrepõe H3.1): no invertido a chave Pix é OPCIONAL. Criar o
    // convite sem pix_chave deve passar (não 400/422 pix_obrigatorio). O receber segue
    // exigindo Pix (coberto pelos demais testes). A chave pode entrar depois via PATCH.
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: {
        direcao: 'pagar',
        nome_devedor: 'Eu Mesmo',
        telefone_devedor: null,
        nome_cobrador: 'João',
        telefone_cobrador: '+5511988887777',
        motivo: 'aluguel',
        itens: [{ descricao: 'Item', qtd: 1, valor_unit_centavos: 5000 }],
        data_combinada: '2026-12-15',
        // sem pix_chave de propósito
      },
    })
    expect(r.statusCode).toBe(201)
    const body = r.json()
    expect(body.aviso.status).toBe('aguardando_aceite')
    expect(body.aviso.pix_chave).toBeNull()
    expect(body.numero_convite).toBeUndefined()
    // E5: no invertido o CONVIDADO é o cobrador; o combinado vai ao telefone_cobrador.
    const { rows } = await poolSuper.query(
      `select alvo_papel, telefone_alvo from public.notificacoes_cobrador
        where aviso_id=$1 and tipo='combinado_enviar'`,
      [body.aviso.id],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].alvo_papel).toBe('cobrador')
    expect(rows[0].telefone_alvo).toBe('+5511988887777')
    await app.close()
  })

  it('payload inválido (valor 0) → 400', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'POST', url: '/v1/avisos', headers: AUTH,
      payload: corpoAviso({ itens: [{ descricao: 'x', qtd: 1, valor_unit_centavos: 0 }] }),
    })
    expect(r.statusCode).toBe(400)
    await app.close()
  })

  it('sem itens → 400', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso({ itens: [] }),
    })
    expect(r.statusCode).toBe(400)
    await app.close()
  })

  it('valor derivado da soma dos itens', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: corpoAviso({
        itens: [
          { descricao: 'A', qtd: 2, valor_unit_centavos: 12000 },
          { descricao: 'B', qtd: 1, valor_unit_centavos: 3500 },
        ],
      }),
    })
    expect(r.statusCode).toBe(201)
    expect(r.json().aviso.valor_centavos).toBe(27500)
    await app.close()
  })

  it('agenda cheia → 422 agenda_cheia (balde único, teto do free = 25, sem apagar nada)', async () => {
    // E11 H11.7: a conta Free que NUNCA comprou tem teto modesto (25). Anotações de agenda
    // (modo agenda) não reservam crédito; o 26º item falha por agenda cheia.
    const cheio = await criarUsuario('AgendaCheia')
    const app = await criarAppTeste(cheio)
    for (let i = 0; i < 25; i++) {
      const r = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAvisoAgenda() })
      expect(r.statusCode).toBe(201)
    }
    const r26 = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAvisoAgenda() })
    expect(r26.statusCode).toBe(422)
    expect(r26.json().error.code).toBe('agenda_cheia')
    await app.close()
    await limparUsuario(cheio)
  })

  it('FREE sem saldo não ativa envio → 422 saldo_insuficiente (item não criado, agenda intacta)', async () => {
    // E11 H11.4: conta nasce Free com cortesia 5. Criar 5 avisos no modo enviar consome o
    // saldo (reserva 1 cada); o 6º falha com saldo_insuficiente (a UI mostra a CTA de comprar).
    const free = await criarUsuario('Free')
    const app = await criarAppTeste(free)
    for (let i = 0; i < 5; i++) {
      const r = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
      expect(r.statusCode).toBe(201)
    }
    const sexto = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    await app.close()
    expect(sexto.statusCode).toBe(422)
    expect(sexto.json().error.code).toBe('saldo_insuficiente')
    // Nada criado além dos 5 (a transação reverteu o 6º).
    const total = await poolSuper.query<{ n: string }>(
      `select count(*) as n from public.avisos where cobrador_id = $1`,
      [free],
    )
    expect(Number(total.rows[0]!.n)).toBe(5)
    await limparUsuario(free)
  })

  it('agenda conta certo no fluxo INVERTIDO (devedor-criador) — C1', async () => {
    // Teto do free = 25; anotações de agenda invertidas (criador = devedor) contam por papel.
    const inv = await criarUsuario('Invertido')
    const app = await criarAppTeste(inv)
    for (let i = 0; i < 25; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/v1/avisos',
        headers: AUTH,
        payload: corpoAvisoAgenda({ direcao: 'pagar', nome_devedor: 'Eu Mesmo' }),
      })
      expect(r.statusCode).toBe(201)
    }
    // 26º invertido bate no teto (a contagem viu os 25 do devedor-criador, por papel).
    const r26 = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: corpoAvisoAgenda({ direcao: 'pagar', nome_devedor: 'Eu Mesmo' }),
    })
    expect(r26.statusCode).toBe(422)
    expect(r26.json().error.code).toBe('agenda_cheia')
    await app.close()
    await limparUsuario(inv)
  })

  it('arquivar libera a vaga da agenda (soft-delete, sem DELETE físico)', async () => {
    const arq = await criarUsuario('Arquivar')
    const app = await criarAppTeste(arq)
    let ultimoId = ''
    for (let i = 0; i < 25; i++) {
      const r = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAvisoAgenda() })
      expect(r.statusCode).toBe(201)
      ultimoId = r.json().aviso.id
    }
    // Cheia: o 26º falha.
    const cheio = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAvisoAgenda() })
    expect(cheio.statusCode).toBe(422)
    // Arquiva um item → libera vaga.
    const arquivar = await app.inject({ method: 'POST', url: `/v1/avisos/${ultimoId}/arquivar`, headers: AUTH })
    expect(arquivar.statusCode).toBe(200)
    expect(arquivar.json().arquivado_em).not.toBeNull()
    // Agora cria de novo (vaga liberada).
    const ok = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAvisoAgenda() })
    expect(ok.statusCode).toBe(201)
    // O registro arquivado NÃO foi apagado (regra de não-DELETE).
    const ainda = await poolSuper.query<{ n: string }>(
      `select count(*) as n from public.avisos where id = $1`,
      [ultimoId],
    )
    expect(Number(ainda.rows[0]!.n)).toBe(1)
    await app.close()
    await limparUsuario(arq)
  })

  it('corrida: dois POST simultâneos no último crédito, só um passa (H11.12)', async () => {
    // E11: o lock por conta na carteira serializa a reserva; sobra exatamente 1 crédito,
    // dois requests concorrentes ativam ao mesmo tempo: só 1 reserva, o outro recusa.
    const corrida = await criarUsuario('Corrida')
    await creditarConta(corrida, 4) // 5 de cortesia + 4 = 9; uso 9, sobra 0 antes da corrida
    const app = await criarAppTeste(corrida)
    for (let i = 0; i < 8; i++) {
      const r = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
      expect(r.statusCode).toBe(201)
    }
    // Resta 1 crédito; dois requests concorrentes: só 1 reserva, o outro -> saldo_insuficiente.
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() }),
      app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() }),
    ])
    const status = [a.statusCode, b.statusCode].sort()
    expect(status).toEqual([201, 422])
    // Nunca fura o saldo: 9 avisos criados, saldo livre = 0, reservado = 9.
    const carteira = await poolSuper.query<{ saldo_livre: number; reservado: number }>(
      `select saldo_livre, reservado from public.creditos_carteira where profile_id = $1`,
      [corrida],
    )
    expect(carteira.rows[0]!.saldo_livre).toBe(0)
    expect(carteira.rows[0]!.reservado).toBe(9)
    await app.close()
    await limparUsuario(corrida)
  })

  it('cancelar é idempotente', async () => {
    const app = await criarAppTeste(uid)
    // pagar invertido: o criador é o devedor e convida um cobrador (nome/telefone_cobrador).
    const criado = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: corpoAviso({
        direcao: 'pagar',
        nome_devedor: 'Eu Mesmo',
        telefone_devedor: null,
        nome_cobrador: 'João',
        telefone_cobrador: '+5511988887777',
        pix_chave: 'joao@pix.com',
      }),
    })
    const id = criado.json().aviso.id
    const c1 = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/cancelar`, headers: AUTH })
    expect(c1.statusCode).toBe(200)
    expect(c1.json().status).toBe('cancelado')
    const c2 = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/cancelar`, headers: AUTH })
    expect(c2.statusCode).toBe(200)
    expect(c2.json().status).toBe('cancelado')
    await app.close()
  })
})

describe('avisos: envios e eventos por aviso (integração)', () => {
  let cobrador: string
  let devedor: string
  let estranho: string

  // Cria aviso 'receber' e aceita como devedor → vira 'programado', cria 4 envios + eventos.
  // E5: aceite por site removido; ativa direto no banco (espelho do aceite WhatsApp).
  async function criarAceito(): Promise<string> {
    const appC = await criarAppTeste(cobrador)
    const criado = await appC.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    await appC.close()
    const body = criado.json()
    await aceitarAvisoDireto(body.aviso.id, devedor)
    return body.aviso.id
  }

  beforeAll(async () => {
    cobrador = await criarUsuario('Cobrador Envios')
    await definirPlano(cobrador, 'profissional')
    devedor = await criarUsuario('Devedor Envios')
    estranho = await criarUsuario('Estranho')
  })
  beforeEach(async () => {
    await limparAvisos(cobrador)
  })
  afterAll(async () => {
    await limparUsuario(cobrador)
    await limparUsuario(devedor)
    await limparUsuario(estranho)
    await encerrarPools()
  })

  it('GET /avisos/:id/envios sem token → 401', async () => {
    const id = await criarAceito()
    const app = await criarAppTeste(cobrador)
    const r = await app.inject({ method: 'GET', url: `/v1/avisos/${id}/envios` })
    await app.close()
    expect(r.statusCode).toBe(401)
  })

  it('cobrador dono lista os 4 envios em ordem cronológica', async () => {
    const id = await criarAceito()
    const app = await criarAppTeste(cobrador)
    const r = await app.inject({ method: 'GET', url: `/v1/avisos/${id}/envios`, headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    const itens = r.json()
    expect(itens).toHaveLength(4)
    expect(itens.map((e: { etapa: string }) => e.etapa)).toEqual(['d_menos_2', 'd_menos_1', 'd', 'd_mais_1'])
  })

  it('devedor vinculado também enxerga os envios', async () => {
    const id = await criarAceito()
    const app = await criarAppTeste(devedor)
    const r = await app.inject({ method: 'GET', url: `/v1/avisos/${id}/envios`, headers: AUTH_DEVEDOR })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(r.json()).toHaveLength(4)
  })

  it('terceiro não-vinculado → 404 (não vaza existência)', async () => {
    const id = await criarAceito()
    const app = await criarAppTeste(estranho)
    const r = await app.inject({ method: 'GET', url: `/v1/avisos/${id}/envios`, headers: { authorization: 'Bearer estranho' } })
    await app.close()
    expect(r.statusCode).toBe(404)
  })

  it('GET /avisos/:id/eventos lista a auditoria em ordem cronológica (criado, aceite)', async () => {
    const id = await criarAceito()
    const app = await criarAppTeste(cobrador)
    const r = await app.inject({ method: 'GET', url: `/v1/avisos/${id}/eventos`, headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    const tipos = r.json().map((e: { tipo: string }) => e.tipo)
    expect(tipos[0]).toBe('criado')
    expect(tipos).toContain('aceite')
  })

  it('eventos de aviso inexistente → 404', async () => {
    const app = await criarAppTeste(cobrador)
    const r = await app.inject({
      method: 'GET',
      url: `/v1/avisos/00000000-0000-0000-0000-000000000000/eventos`,
      headers: AUTH,
    })
    await app.close()
    expect(r.statusCode).toBe(404)
  })

  // E5/H5.0: estado REAL do envio do combinado (a UI não pode afirmar "enviado" antes de sair).
  describe('GET /avisos/:id/combinado-envio', () => {
    async function criarNaoAceito(): Promise<string> {
      const app = await criarAppTeste(cobrador)
      const criado = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
      await app.close()
      return criado.json().aviso.id
    }
    async function setStatusCombinado(avisoId: string, status: string, erro: string | null, enviadoEm: string | null) {
      await poolSuper.query(
        `update public.notificacoes_cobrador set status=$2, erro=$3, enviado_em=$4
          where aviso_id=$1 and tipo='combinado_enviar'`,
        [avisoId, status, erro, enviadoEm],
      )
    }

    it('recém-criado (agendado) → estado enviando, enviado_em null', async () => {
      const id = await criarNaoAceito()
      const app = await criarAppTeste(cobrador)
      const r = await app.inject({ method: 'GET', url: `/v1/avisos/${id}/combinado-envio`, headers: AUTH })
      await app.close()
      expect(r.statusCode).toBe(200)
      expect(r.json().estado).toBe('enviando')
      expect(r.json().enviado_em).toBeNull()
    })

    it('gate de template (agendado + erro sem_template_ativo) ainda é enviando (não vaza o motivo)', async () => {
      const id = await criarNaoAceito()
      await setStatusCombinado(id, 'agendado', 'sem_template_ativo', null)
      const app = await criarAppTeste(cobrador)
      const r = await app.inject({ method: 'GET', url: `/v1/avisos/${id}/combinado-envio`, headers: AUTH })
      await app.close()
      expect(r.json().estado).toBe('enviando')
      // sem código interno na resposta
      expect(JSON.stringify(r.json())).not.toContain('sem_template_ativo')
    })

    it('enviado carimba estado enviado + enviado_em', async () => {
      const id = await criarNaoAceito()
      await setStatusCombinado(id, 'enviado', null, '2026-07-13T00:00:00Z')
      const app = await criarAppTeste(cobrador)
      const r = await app.inject({ method: 'GET', url: `/v1/avisos/${id}/combinado-envio`, headers: AUTH })
      await app.close()
      expect(r.json().estado).toBe('enviado')
      expect(r.json().enviado_em).not.toBeNull()
    })

    it('falhou → estado nao_enviado', async () => {
      const id = await criarNaoAceito()
      await setStatusCombinado(id, 'falhou', 'envio_132001: erro', null)
      const app = await criarAppTeste(cobrador)
      const r = await app.inject({ method: 'GET', url: `/v1/avisos/${id}/combinado-envio`, headers: AUTH })
      await app.close()
      expect(r.json().estado).toBe('nao_enviado')
    })

    it('terceiro não-vinculado → 404 (não vaza existência); sem token → 401', async () => {
      const id = await criarNaoAceito()
      const appEstranho = await criarAppTeste(estranho)
      const rEstranho = await appEstranho.inject({
        method: 'GET',
        url: `/v1/avisos/${id}/combinado-envio`,
        headers: { authorization: 'Bearer estranho' },
      })
      await appEstranho.close()
      expect(rEstranho.statusCode).toBe(404)

      const appSem = await criarAppTeste(cobrador)
      const rSem = await appSem.inject({ method: 'GET', url: `/v1/avisos/${id}/combinado-envio` })
      await appSem.close()
      expect(rSem.statusCode).toBe(401)
    })
  })
})
