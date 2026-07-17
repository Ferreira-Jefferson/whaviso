// E2 — Criar combinado (fluxo receber): convite de 6 dígitos (hash + unicidade por
// telefone), Pix obrigatório + titular/banco, sub-ciclo de edição com reaprovação,
// pausar/reativar, cancelar com notificação ao devedor, limite de edições por plano.
// Integração com whaviso_dev (app real + DB). Confronta com a história 02.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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
    itens: [{ descricao: 'Item', qtd: 1, valor_unit_centavos: 9900 }],
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

  it('H5.0: a criação no modo enviar não devolve número nem link/mensagem manual', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    await app.close()
    const body = r.json()
    // E5: o Whaviso envia o combinado direto ao convidado (com botões); a api devolve só o
    // aviso, sem número de convite, mensagem pronta ou link wa.me.
    expect(body.numero_convite).toBeUndefined()
    expect(body.mensagem_convite).toBeUndefined()
    expect(body.link_whatsapp).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('wa.me/')
  })

  it('H5.0: evento combinado_gerado é gravado', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    await app.close()
    const { rows } = await poolSuper.query<{ tipo: string }>(
      `select tipo from public.eventos_aviso where aviso_id = $1`,
      [r.json().aviso.id],
    )
    expect(rows.map((x) => x.tipo)).toContain('combinado_gerado')
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
      method: 'PATCH', url: `/v1/avisos/${id}`, headers: AUTH,
      payload: { itens: [{ descricao: 'Item', qtd: 1, valor_unit_centavos: 12000 }] },
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
      method: 'PATCH', url: `/v1/avisos/${id}`, headers: AUTH,
      payload: { itens: [{ descricao: 'Item', qtd: 1, valor_unit_centavos: 15000 }] },
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
    await appC.inject({ method: 'PATCH', url: `/v1/avisos/${id}`, headers: AUTH, payload: { itens: [{ descricao: 'Item', qtd: 1, valor_unit_centavos: 15000 }] } })
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

  it('edição de itens que MANTÉM o total é livre (sem reaprovação)', async () => {
    // O aceito nasce com total 9900 (item default). Trocar a composição mantendo a soma
    // (ex.: renomear o item) é edição INTERNA livre: aplica direto, não abre reaprovação.
    const { id } = await criarAceito()
    const appC = await criarAppTeste(cobrador)
    const r = await appC.inject({
      method: 'PATCH', url: `/v1/avisos/${id}`, headers: AUTH,
      payload: { itens: [{ descricao: 'Novo', qtd: 1, valor_unit_centavos: 9900 }] },
    })
    await appC.close()
    expect(r.statusCode).toBe(200)
    // Não foi a reaprovação: segue programado (não aguardando_aprovacao_aviso_editado).
    expect(r.json().status).toBe('programado')
    expect(await statusDe(id)).toBe('programado')
    // Nenhuma edição pendente foi aberta (edição livre não entra no sub-ciclo).
    const { rows } = await poolSuper.query<{ n: string }>(
      `select count(*) as n from public.avisos_edicoes where aviso_id=$1 and resolucao is null`, [id],
    )
    expect(Number(rows[0]!.n)).toBe(0)
  })

  it('desfazer edição de itens reverte itens e valor', async () => {
    // Mudar a composição de forma que ALTERE o total é acordo (reaprovação); desfazer
    // restaura o valor E os itens anteriores (o snapshot cobre ambos).
    const { id } = await criarAceito()
    const appC = await criarAppTeste(cobrador)
    await appC.inject({
      method: 'PATCH', url: `/v1/avisos/${id}`, headers: AUTH,
      payload: { itens: [{ descricao: 'X', qtd: 1, valor_unit_centavos: 15000 }] },
    })
    expect(await statusDe(id)).toBe('aguardando_aprovacao_aviso_editado')
    const r = await appC.inject({ method: 'POST', url: `/v1/avisos/${id}/desfazer-edicao`, headers: AUTH })
    await appC.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().status).toBe('programado')
    // Valor E composição voltaram ao estado anterior (item default de 9900).
    expect(r.json().valor_centavos).toBe(9900)
    // E18: o item de texto livre ganhou vínculo ao catálogo (produto_id) ao criar; o snapshot
    // restaurado no desfazer preserva esse vínculo.
    expect(r.json().itens).toEqual([
      { descricao: 'Item', qtd: 1, valor_unit_centavos: 9900, produto_id: expect.any(String) },
    ])
    // Confirma na fonte (jsonb persistido).
    const { rows } = await poolSuper.query<{ valor_centavos: string; itens: unknown }>(
      `select valor_centavos::bigint as valor_centavos, itens from public.avisos where id=$1`, [id],
    )
    expect(Number(rows[0]!.valor_centavos)).toBe(9900)
    expect(rows[0]!.itens).toEqual([
      { descricao: 'Item', qtd: 1, valor_unit_centavos: 9900, produto_id: expect.any(String) },
    ])
  })

  it('H2.5: não pode editar de novo enquanto há edição aguardando aprovação', async () => {
    const { id } = await criarAceito()
    const appC = await criarAppTeste(cobrador)
    await appC.inject({ method: 'PATCH', url: `/v1/avisos/${id}`, headers: AUTH, payload: { itens: [{ descricao: 'Item', qtd: 1, valor_unit_centavos: 15000 }] } })
    const r = await appC.inject({ method: 'PATCH', url: `/v1/avisos/${id}`, headers: AUTH, payload: { itens: [{ descricao: 'Item', qtd: 1, valor_unit_centavos: 16000 }] } })
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
      const e = await appC.inject({ method: 'PATCH', url: `/v1/avisos/${id}`, headers: AUTH, payload: { itens: [{ descricao: 'Item', qtd: 1, valor_unit_centavos: 10000 + i }] } })
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
    // E5: o combinado (combinado_enviar) é enfileirado na criação; isso é esperado. O que
    // NÃO deve acontecer é uma notificação de CANCELAMENTO ao devedor (ele não estava no
    // combinado). O envio pendente é superado no dreno (aviso saiu de aguardando_aceite).
    const notifs = await notifsAoDevedor(id)
    expect(notifs.some((n) => n.tipo === 'aviso_cancelado')).toBe(false)
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
    await appC.inject({ method: 'PATCH', url: `/v1/avisos/${b.id}`, headers: AUTH, payload: { itens: [{ descricao: 'Item', qtd: 1, valor_unit_centavos: 13000 }] } })
    await appC.close()
    const { rows } = await poolSuper.query<{ n: number }>(`select public.contar_agenda($1) as n`, [cobrador])
    expect(Number(rows[0]!.n)).toBe(2)
  })
})
