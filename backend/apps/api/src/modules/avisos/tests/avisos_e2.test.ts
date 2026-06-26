// E2 — Criar combinado (fluxo receber): convite de 6 dígitos (hash + unicidade por
// telefone), Pix obrigatório + titular/banco, sub-ciclo de edição com reaprovação,
// pausar/reativar, cancelar com notificação ao devedor, limite de edições por plano.
// Integração com whaviso_dev (app real + DB). Confronta com a história 02.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sha256Hex } from '../../../shared/tokens'
import {
  aceitarAvisoDireto,
  criarAppTeste,
  criarUsuario,
  definirPlano,
  encerrarPools,
  limparAvisos,
  limparUsuario,
  poolSuper,
} from '../../../../test/harness'

const AUTH = { authorization: 'Bearer fake' }

function corpoAviso(over: Record<string, unknown> = {}) {
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

describe('E2 H2.1/H2.2: criar + Pix obrigatório + convite de 6 dígitos', () => {
  let uid: string
  beforeAll(async () => {
    uid = await criarUsuario('Cobrador E2')
    await definirPlano(uid, 'profissional')
  })
  beforeEach(async () => {
    await limparAvisos(uid)
  })
  afterAll(async () => {
    await limparUsuario(uid)
  })

  it('H2.1: rejeita sem chave Pix no receber → 400 (Pix obrigatório)', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'POST', url: '/v1/avisos', headers: AUTH,
      payload: corpoAviso({ pix_chave: undefined }),
    })
    await app.close()
    expect(r.statusCode).toBe(400)
  })

  it('H2.1: rejeita sem titular/banco no receber → 400', async () => {
    const app = await criarAppTeste(uid)
    const r1 = await app.inject({
      method: 'POST', url: '/v1/avisos', headers: AUTH,
      payload: corpoAviso({ pix_titular: undefined }),
    })
    const r2 = await app.inject({
      method: 'POST', url: '/v1/avisos', headers: AUTH,
      payload: corpoAviso({ pix_banco: undefined }),
    })
    await app.close()
    expect(r1.statusCode).toBe(400)
    expect(r2.statusCode).toBe(400)
  })

  it('H2.1: persiste titular/banco e nasce em aguardando_aceite', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    await app.close()
    expect(r.statusCode).toBe(201)
    const body = r.json()
    expect(body.aviso.status).toBe('aguardando_aceite')
    expect(body.aviso.pix_titular).toBe('Maria Silva')
    expect(body.aviso.pix_banco).toBe('Banco Exemplo')
  })

  it('H2.2: gera número xxx-xxx + mensagem com link wa.me do Whaviso; só o HASH persiste', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    await app.close()
    const body = r.json()
    // Formato xxx-xxx (hífen só visual).
    expect(body.numero_convite).toMatch(/^\d{3}-\d{3}$/)
    // Mensagem completa: intro + número + link.
    expect(body.mensagem_convite).toContain(body.numero_convite)
    expect(body.mensagem_convite).toContain('Whaviso')
    // Link wa.me do WHAVISO (não do convidado) com a 1ª mensagem pré-preenchida.
    expect(body.link_whatsapp).toContain('https://wa.me/5511999990000')
    expect(decodeURIComponent(body.link_whatsapp)).toContain('meu convite é o')
    expect(decodeURIComponent(body.link_whatsapp)).toContain(body.numero_convite)

    // O CLARO nunca persiste: o banco guarda só o hash sha256 do número (6 dígitos).
    const corrido = body.numero_convite.replace('-', '')
    const { rows } = await poolSuper.query<{ convite_hash: string | null }>(
      `select convite_hash from public.avisos where id = $1`,
      [body.aviso.id],
    )
    expect(rows[0]!.convite_hash).toBe(sha256Hex(corrido))
    // O número em claro NÃO aparece em nenhuma coluna textual do aviso.
    const todo = await poolSuper.query<{ t: string }>(
      `select coalesce(nome_devedor,'')||coalesce(motivo,'')||coalesce(pix_chave,'')||coalesce(convite_hash,'') as t
       from public.avisos where id = $1`,
      [body.aviso.id],
    )
    expect(todo.rows[0]!.t).not.toContain(corrido)
  })

  it('H2.2: contador de tentativas (anti-brute-force) nasce em 0 (efeito é E5)', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    await app.close()
    const { rows } = await poolSuper.query<{ convite_tentativas: number }>(
      `select convite_tentativas from public.avisos where id = $1`,
      [r.json().aviso.id],
    )
    expect(rows[0]!.convite_tentativas).toBe(0)
  })

  it('H2.2: evento convite_gerado é gravado', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    await app.close()
    const { rows } = await poolSuper.query<{ tipo: string }>(
      `select tipo from public.eventos_aviso where aviso_id = $1`,
      [r.json().aviso.id],
    )
    expect(rows.map((x) => x.tipo)).toContain('convite_gerado')
  })

  it('H2.2: telefones DIFERENTES podem ter o MESMO número (unicidade é por par)', async () => {
    // Força colisão controlada: insere a mão dois avisos com telefones distintos e o
    // MESMO convite_hash; o índice parcial (telefone, hash) permite.
    const hash = sha256Hex('123456')
    const ins = async (tel: string) =>
      poolSuper.query(
        `insert into public.avisos
           (cobrador_id, direcao, criador_papel, status, nome_devedor, telefone_devedor,
            motivo, valor_centavos, data_combinada, pix_chave, pix_titular, pix_banco, convite_hash)
         values ($1,'receber','cobrador','aguardando_aceite','Maria',$2,'aluguel',9900,'2026-12-15','k@pix','Titular','Banco',$3)`,
        [uid, tel, hash],
      )
    await ins('+5511900000001')
    await expect(ins('+5511900000002')).resolves.toBeDefined()
  })

  it('H2.2: MESMO telefone NÃO pode repetir o número (unicidade por telefone)', async () => {
    const hash = sha256Hex('654321')
    const ins = async () =>
      poolSuper.query(
        `insert into public.avisos
           (cobrador_id, direcao, criador_papel, status, nome_devedor, telefone_devedor,
            motivo, valor_centavos, data_combinada, pix_chave, pix_titular, pix_banco, convite_hash)
         values ($1,'receber','cobrador','aguardando_aceite','Maria','+5511933330000','aluguel',9900,'2026-12-15','k@pix','Titular','Banco',$2)`,
        [uid, hash],
      )
    await ins()
    await expect(ins()).rejects.toMatchObject({ code: '23505' })
  })

  it('H2.2: geração sob corrida no MESMO telefone — N criações não colidem', async () => {
    // 5 criações concorrentes para o mesmo telefone_devedor: o loop de retry + índice
    // único garantem 5 números DISTINTOS (nenhuma colisão persiste).
    const app = await criarAppTeste(uid)
    const reqs = Array.from({ length: 5 }, () =>
      app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() }),
    )
    const res = await Promise.all(reqs)
    await app.close()
    expect(res.every((r) => r.statusCode === 201)).toBe(true)
    const numeros = res.map((r) => r.json().numero_convite)
    expect(new Set(numeros).size).toBe(numeros.length) // todos distintos
  })

  it('H2.4: em aguardando_aceite NENHUM envio é criado', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    await app.close()
    const { rows } = await poolSuper.query<{ n: string }>(
      `select count(*) as n from public.envios where aviso_id = $1`,
      [r.json().aviso.id],
    )
    expect(Number(rows[0]!.n)).toBe(0)
  })
})

describe('E2 H2.5/H2.6/H2.7: editar (sub-ciclo), pausar/reativar, cancelar', () => {
  let cobrador: string
  let devedor: string

  // Cria 'receber' e aceita como devedor → vira 'programado' com envios.
  // E5: aceite por site removido; ativa direto no banco (espelho do aceite WhatsApp).
  async function criarAceito(): Promise<{ id: string }> {
    const appC = await criarAppTeste(cobrador)
    const criado = await appC.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    await appC.close()
    const body = criado.json()
    await aceitarAvisoDireto(body.aviso.id, devedor)
    return { id: body.aviso.id }
  }

  async function statusDe(id: string): Promise<string> {
    const { rows } = await poolSuper.query<{ status: string }>(`select status from public.avisos where id=$1`, [id])
    return rows[0]!.status
  }
  async function notifsAoDevedor(id: string): Promise<{ tipo: string; alvo_papel: string }[]> {
    const { rows } = await poolSuper.query<{ tipo: string; alvo_papel: string }>(
      `select tipo, alvo_papel from public.notificacoes_cobrador where aviso_id=$1 and status<>'cancelado'`,
      [id],
    )
    return rows
  }
  async function enviosVivos(id: string): Promise<number> {
    const { rows } = await poolSuper.query<{ n: string }>(
      `select count(*) as n from public.envios where aviso_id=$1 and status in ('agendado','processando')`,
      [id],
    )
    return Number(rows[0]!.n)
  }

  beforeAll(async () => {
    cobrador = await criarUsuario('Cobrador Edit')
    await definirPlano(cobrador, 'profissional') // edicoes_max = 10
    devedor = await criarUsuario('Devedor Edit')
  })
  beforeEach(async () => {
    await limparAvisos(cobrador)
  })
  afterAll(async () => {
    await limparUsuario(cobrador)
    await limparUsuario(devedor)
    await encerrarPools()
  })

  it('H2.5: editar ANTES do aceite aplica direto (sem reaprovação)', async () => {
    const appC = await criarAppTeste(cobrador)
    const criado = await appC.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    const id = criado.json().aviso.id
    const r = await appC.inject({
      method: 'PATCH', url: `/v1/avisos/${id}`, headers: AUTH, payload: { valor_centavos: 12000 },
    })
    await appC.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().status).toBe('aguardando_aceite')
    expect(r.json().valor_centavos).toBe(12000)
    // Nenhuma edição registrada no histórico (edição livre não consome a alavanca).
    const { rows } = await poolSuper.query<{ n: string }>(
      `select count(*) as n from public.avisos_edicoes where aviso_id=$1`, [id],
    )
    expect(Number(rows[0]!.n)).toBe(0)
  })

  it('H2.5: editar DEPOIS do aceite vai a aguardando_aprovacao, pausa lembretes, notifica devedor', async () => {
    const { id } = await criarAceito()
    expect(await enviosVivos(id)).toBeGreaterThan(0)
    const appC = await criarAppTeste(cobrador)
    const r = await appC.inject({
      method: 'PATCH', url: `/v1/avisos/${id}`, headers: AUTH, payload: { valor_centavos: 15000 },
    })
    await appC.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().status).toBe('aguardando_aprovacao_aviso_editado')
    // Lembretes SUSPENSOS pelo trigger (nenhum envio vivo).
    expect(await enviosVivos(id)).toBe(0)
    // Devedor notificado (alvo devedor) que há alteração a aprovar.
    const notifs = await notifsAoDevedor(id)
    expect(notifs).toContainEqual({ tipo: 'aviso_edicao_a_aprovar', alvo_papel: 'devedor' })
    // Snapshot do "antes" guardado (valor anterior 9900).
    const { rows } = await poolSuper.query<{ dados_anteriores: { valor_centavos: number } }>(
      `select dados_anteriores from public.avisos_edicoes where aviso_id=$1 and resolucao is null`, [id],
    )
    expect(rows[0]!.dados_anteriores.valor_centavos).toBe(9900)
  })

  it('H2.5: DESFAZER restaura as condições anteriores e volta a programado', async () => {
    const { id } = await criarAceito()
    const appC = await criarAppTeste(cobrador)
    await appC.inject({ method: 'PATCH', url: `/v1/avisos/${id}`, headers: AUTH, payload: { valor_centavos: 15000 } })
    const r = await appC.inject({ method: 'POST', url: `/v1/avisos/${id}/desfazer-edicao`, headers: AUTH })
    await appC.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().status).toBe('programado')
    expect(r.json().valor_centavos).toBe(9900) // restaurou
    // A edição foi fechada como desfeita (não some — append-only).
    const { rows } = await poolSuper.query<{ resolucao: string }>(
      `select resolucao from public.avisos_edicoes where aviso_id=$1`, [id],
    )
    expect(rows[0]!.resolucao).toBe('desfeita')
  })

  it('H2.5: não pode editar de novo enquanto há edição aguardando aprovação', async () => {
    const { id } = await criarAceito()
    const appC = await criarAppTeste(cobrador)
    await appC.inject({ method: 'PATCH', url: `/v1/avisos/${id}`, headers: AUTH, payload: { valor_centavos: 15000 } })
    const r = await appC.inject({ method: 'PATCH', url: `/v1/avisos/${id}`, headers: AUTH, payload: { valor_centavos: 16000 } })
    await appC.close()
    expect(r.statusCode).toBe(409)
    expect(r.json().error.code).toBe('edicao_em_aprovacao')
  })

  it('E11 H11.2: editar é UNIVERSAL (sem teto de edições por plano)', async () => {
    // Não há mais alavanca edicoes_max: editar é liberado para todos. 4 ciclos
    // editar->desfazer (mais que o antigo teto de 3) seguem passando.
    const cob = await criarUsuario('Cobrador Edicoes')
    const dev = await criarUsuario('Devedor Edicoes')
    const appC = await criarAppTeste(cob)
    const criado = await appC.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    const id = criado.json().aviso.id
    await aceitarAvisoDireto(id, dev) // E5: site de aceite removido

    for (let i = 0; i < 4; i++) {
      const e = await appC.inject({ method: 'PATCH', url: `/v1/avisos/${id}`, headers: AUTH, payload: { valor_centavos: 10000 + i } })
      expect(e.statusCode).toBe(200)
      await appC.inject({ method: 'POST', url: `/v1/avisos/${id}/desfazer-edicao`, headers: AUTH })
    }
    await appC.close()
    await limparUsuario(cob)
    await limparUsuario(dev)
  })

  it('H2.7: pausar só de aceito; pausa suspende lembretes e notifica devedor', async () => {
    const { id } = await criarAceito()
    const appC = await criarAppTeste(cobrador)
    const r = await appC.inject({ method: 'POST', url: `/v1/avisos/${id}/pausar`, headers: AUTH })
    await appC.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().status).toBe('pausado')
    expect(await enviosVivos(id)).toBe(0) // suspensos
    expect(await notifsAoDevedor(id)).toContainEqual({ tipo: 'aviso_pausado', alvo_papel: 'devedor' })
  })

  it('H2.7: não dá para pausar antes do aceite', async () => {
    const appC = await criarAppTeste(cobrador)
    const criado = await appC.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    const id = criado.json().aviso.id
    const r = await appC.inject({ method: 'POST', url: `/v1/avisos/${id}/pausar`, headers: AUTH })
    await appC.close()
    expect(r.statusCode).toBe(409)
    expect(r.json().error.code).toBe('aviso_nao_pausavel')
  })

  it('H2.7: reativar volta a programado e notifica devedor', async () => {
    const { id } = await criarAceito()
    const appC = await criarAppTeste(cobrador)
    await appC.inject({ method: 'POST', url: `/v1/avisos/${id}/pausar`, headers: AUTH })
    const r = await appC.inject({ method: 'POST', url: `/v1/avisos/${id}/reativar`, headers: AUTH })
    await appC.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().status).toBe('programado')
    expect(await notifsAoDevedor(id)).toContainEqual({ tipo: 'aviso_reativado', alvo_papel: 'devedor' })
  })

  it('H2.6: cancelar ACEITO notifica o devedor; cancelado é terminal e não some', async () => {
    const { id } = await criarAceito()
    const appC = await criarAppTeste(cobrador)
    const r = await appC.inject({ method: 'POST', url: `/v1/avisos/${id}/cancelar`, headers: AUTH })
    await appC.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().status).toBe('cancelado')
    expect(await notifsAoDevedor(id)).toContainEqual({ tipo: 'aviso_cancelado', alvo_papel: 'devedor' })
    // Não apagou (regra de não-DELETE).
    const { rows } = await poolSuper.query<{ n: string }>(`select count(*) as n from public.avisos where id=$1`, [id])
    expect(Number(rows[0]!.n)).toBe(1)
  })

  it('H9.4: GET /avisos/:id/eventos valida 200 após cancelar (evento cancelado_criador no contrato)', async () => {
    const { id } = await criarAceito()
    const appC = await criarAppTeste(cobrador)
    await appC.inject({ method: 'POST', url: `/v1/avisos/${id}/cancelar`, headers: AUTH })
    // A resposta passa pela validação Zod (listaEventosResposta usa tipoEvento);
    // se o enum não conhecesse cancelado_criador, a serialização quebraria.
    const r = await appC.inject({ method: 'GET', url: `/v1/avisos/${id}/eventos`, headers: AUTH })
    await appC.close()
    expect(r.statusCode).toBe(200)
    const tipos = r.json().map((e: { tipo: string }) => e.tipo)
    expect(tipos).toContain('cancelado_criador')
  })

  it('H2.6: cancelar ANTES do aceite NÃO notifica o devedor (ainda não está no combinado)', async () => {
    const appC = await criarAppTeste(cobrador)
    const criado = await appC.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    const id = criado.json().aviso.id
    const r = await appC.inject({ method: 'POST', url: `/v1/avisos/${id}/cancelar`, headers: AUTH })
    await appC.close()
    expect(r.statusCode).toBe(200)
    expect(await notifsAoDevedor(id)).toHaveLength(0)
  })

  it('H2.6: cancelar é possível em PAUSADO (fase viva) e notifica o devedor', async () => {
    const { id } = await criarAceito()
    const appC = await criarAppTeste(cobrador)
    await appC.inject({ method: 'POST', url: `/v1/avisos/${id}/pausar`, headers: AUTH })
    const r = await appC.inject({ method: 'POST', url: `/v1/avisos/${id}/cancelar`, headers: AUTH })
    await appC.close()
    expect(r.statusCode).toBe(200)
    expect(await statusDe(id)).toBe('cancelado')
    expect(await notifsAoDevedor(id)).toContainEqual({ tipo: 'aviso_cancelado', alvo_papel: 'devedor' })
  })

  it('H2.3/G-B2: pausado e aguardando_aprovacao CONTAM como ativos na agenda', async () => {
    // Cria 2 avisos, aceita ambos, pausa um e edita o outro: ambos seguem ocupando
    // vaga (não-terminais). A contagem de agenda (balde único) os inclui.
    const a = await criarAceito()
    const b = await criarAceito()
    const appC = await criarAppTeste(cobrador)
    await appC.inject({ method: 'POST', url: `/v1/avisos/${a.id}/pausar`, headers: AUTH })
    await appC.inject({ method: 'PATCH', url: `/v1/avisos/${b.id}`, headers: AUTH, payload: { valor_centavos: 13000 } })
    await appC.close()
    const { rows } = await poolSuper.query<{ n: number }>(`select public.contar_agenda($1) as n`, [cobrador])
    expect(Number(rows[0]!.n)).toBe(2)
  })
})
