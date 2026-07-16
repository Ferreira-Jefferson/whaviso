import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  criarAppTeste,
  criarUsuario,
  encerrarPools,
  limparUsuario,
  poolSuper,
} from '../../../../test/harness'

const AUTH = { authorization: 'Bearer x' }

describe('admin (integração)', () => {
  let owner: string
  let comum: string

  beforeAll(async () => {
    owner = await criarUsuario('Owner')
    comum = await criarUsuario('Comum')
    await poolSuper.query(`update public.profiles set role='owner' where id=$1`, [owner])
  })
  afterAll(async () => {
    await limparUsuario(owner)
    await limparUsuario(comum)
    await encerrarPools()
  })

  it('usuário não-owner → 403', async () => {
    const app = await criarAppTeste(comum)
    const r = await app.inject({ method: 'GET', url: '/v1/admin/mensagens', headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(403)
  })

  it('owner lista mensagens do ciclo (migradas para a unificada)', async () => {
    const app = await criarAppTeste(owner)
    const r = await app.inject({ method: 'GET', url: '/v1/admin/mensagens', headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    const chaves = r.json().mensagens.map((m: { chave: string }) => m.chave)
    expect(chaves).toContain('ciclo.d_menos_2')
    expect(chaves).toContain('ciclo.d_mais_1')
  })

  it('apagar mensagem é owner-only → 403 para não-owner', async () => {
    const app = await criarAppTeste(comum)
    const r = await app.inject({ method: 'DELETE', url: `/v1/admin/mensagens/00000000-0000-0000-0000-000000000000`, headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(403)
  })

  // ---- Auditoria (read-only) ----

  it('GET /admin/usuarios: não-owner → 403; owner recebe envelope paginado', async () => {
    const appComum = await criarAppTeste(comum)
    const proibido = await appComum.inject({ method: 'GET', url: '/v1/admin/usuarios', headers: AUTH })
    await appComum.close()
    expect(proibido.statusCode).toBe(403)

    const app = await criarAppTeste(owner)
    const r = await app.inject({ method: 'GET', url: '/v1/admin/usuarios', headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(Array.isArray(body.itens)).toBe(true)
    expect(body.total).toBeGreaterThanOrEqual(2)
    expect(typeof body.page).toBe('number')
    expect(typeof body.per_page).toBe('number')
  })

  it('GET /admin/usuarios?busca= filtra por nome', async () => {
    const app = await criarAppTeste(owner)
    const r = await app.inject({ method: 'GET', url: '/v1/admin/usuarios?busca=Owner', headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().itens.every((u: { nome: string }) => u.nome.includes('Owner'))).toBe(true)
  })

  it('GET /admin/usuarios mostra o SALDO da carteira (E11)', async () => {
    const app = await criarAppTeste(owner)
    const r = await app.inject({ method: 'GET', url: `/v1/admin/usuarios?busca=Comum`, headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    const linha = r.json().itens.find((u: { id: string }) => u.id === comum)
    // Conta nasce com a cortesia (5 envios); baldes começam zerados.
    expect(linha.saldo_livre).toBe(5)
    expect(linha.reservado).toBe(0)
    expect(linha.em_hold).toBe(0)
    expect(linha.consumido).toBe(0)
    expect(linha.ja_comprou).toBe(false)
  })

  // ---- Crédito do owner + edição da curva (H11.11) ----

  it('POST /admin/usuarios/:id/creditar é owner-only → 403 para não-owner', async () => {
    const app = await criarAppTeste(comum)
    const r = await app.inject({
      method: 'POST', url: `/v1/admin/usuarios/${comum}/creditar`, headers: AUTH,
      payload: { quantidade: 100 },
    })
    await app.close()
    expect(r.statusCode).toBe(403)
  })

  it('owner credita envios: aditivo, marca ja_comprou, lança no livro-razão', async () => {
    const app = await criarAppTeste(owner)
    const c1 = await app.inject({
      method: 'POST', url: `/v1/admin/usuarios/${comum}/creditar`, headers: AUTH,
      payload: { quantidade: 100 },
    })
    expect(c1.statusCode).toBe(200)
    expect(c1.json().saldo_livre).toBe(105) // 5 de cortesia + 100
    expect(c1.json().ja_comprou).toBe(true)

    // Aditivo: creditar de novo SOMA, nunca substitui.
    const c2 = await app.inject({
      method: 'POST', url: `/v1/admin/usuarios/${comum}/creditar`, headers: AUTH,
      payload: { quantidade: 25 },
    })
    await app.close()
    expect(c2.json().saldo_livre).toBe(130)

    // Livro-razão: 2 lançamentos 'credito_owner' com ator 'owner'.
    const lanc = await poolSuper.query<{ n: number }>(
      `select count(*)::int as n from public.creditos_lancamentos
        where profile_id=$1 and tipo='credito_owner' and ator='owner'`,
      [comum],
    )
    expect(lanc.rows[0]!.n).toBe(2)
  })

  it('creditar quantidade <= 0 → 400 (contrato recusa)', async () => {
    const app = await criarAppTeste(owner)
    const r = await app.inject({
      method: 'POST', url: `/v1/admin/usuarios/${comum}/creditar`, headers: AUTH,
      payload: { quantidade: 0 },
    })
    await app.close()
    expect(r.statusCode).toBe(400)
  })

  it('creditar conta inexistente → 404', async () => {
    const app = await criarAppTeste(owner)
    const r = await app.inject({
      method: 'POST', url: `/v1/admin/usuarios/00000000-0000-0000-0000-000000000000/creditar`,
      headers: AUTH, payload: { quantidade: 10 },
    })
    await app.close()
    expect(r.statusCode).toBe(404)
  })

  it('PATCH /admin/creditos-catalogo é owner-only → 403 para não-owner', async () => {
    const app = await criarAppTeste(comum)
    const r = await app.inject({
      method: 'PATCH', url: '/v1/admin/creditos-catalogo', headers: AUTH,
      payload: { cortesia_inicial: 3 },
    })
    await app.close()
    expect(r.statusCode).toBe(403)
  })

  it('owner edita a curva de marcos; reflete na carteira (runtime); restaura', async () => {
    const antes = await poolSuper.query(
      `select envios_min, envios_max, curva, cortesia_inicial from public.creditos_catalogo where id=1`,
    )
    const orig = antes.rows[0]

    const novaCurva = [
      { envios: 10, centavos: 120 },
      { envios: 250, centavos: 60 },
    ]
    const app = await criarAppTeste(owner)
    const patch = await app.inject({
      method: 'PATCH', url: '/v1/admin/creditos-catalogo', headers: AUTH,
      payload: { curva: novaCurva, cortesia_inicial: 3 },
    })
    expect(patch.statusCode).toBe(200)
    expect(patch.json().curva).toEqual(novaCurva)
    expect(patch.json().cortesia_inicial).toBe(3)
    // envios_min/max derivam do primeiro/último marco.
    expect(patch.json().envios_min).toBe(10)
    expect(patch.json().envios_max).toBe(250)

    // Reflete no que a tela de créditos lê (GET /v1/billing/carteira -> catalogo).
    const cat = await app.inject({ method: 'GET', url: '/v1/billing/carteira', headers: AUTH })
    await app.close()
    expect(cat.json().catalogo.curva).toEqual(novaCurva)

    // Restaura para não afetar billing.test.ts (assertivas fixas na curva original).
    await poolSuper.query(
      `update public.creditos_catalogo
          set envios_min=$1, envios_max=$2, curva=$3::jsonb, cortesia_inicial=$4 where id=1`,
      [orig.envios_min, orig.envios_max, JSON.stringify(orig.curva), orig.cortesia_inicial],
    )
  })

  it('PATCH /admin/creditos-catalogo: curva inválida no body → 400', async () => {
    const app = await criarAppTeste(owner)
    // Menos de 2 marcos.
    const poucos = await app.inject({
      method: 'PATCH', url: '/v1/admin/creditos-catalogo', headers: AUTH,
      payload: { curva: [{ envios: 10, centavos: 100 }] },
    })
    // Marcos não crescentes em envios.
    const naoCrescente = await app.inject({
      method: 'PATCH', url: '/v1/admin/creditos-catalogo', headers: AUTH,
      payload: { curva: [{ envios: 50, centavos: 90 }, { envios: 50, centavos: 80 }] },
    })
    await app.close()
    expect(poucos.statusCode).toBe(400)
    expect(naoCrescente.statusCode).toBe(400)
  })

  it('PATCH /admin/creditos-catalogo: estado MERGEADO inválido → 422 catalogo_invalido', async () => {
    // Só envia agenda_teto_free acima do teto pago atual (1000): o merge fica inválido.
    const app = await criarAppTeste(owner)
    const r = await app.inject({
      method: 'PATCH', url: '/v1/admin/creditos-catalogo', headers: AUTH,
      payload: { agenda_teto_free: 99999 },
    })
    await app.close()
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('catalogo_invalido')
  })

  it('GET /admin/envios e /admin/avisos: envelopes paginados (owner)', async () => {
    const app = await criarAppTeste(owner)
    const envios = await app.inject({ method: 'GET', url: '/v1/admin/envios', headers: AUTH })
    const avisos = await app.inject({ method: 'GET', url: '/v1/admin/avisos?status=programado', headers: AUTH })
    await app.close()
    expect(envios.statusCode).toBe(200)
    expect(Array.isArray(envios.json().itens)).toBe(true)
    expect(avisos.statusCode).toBe(200)
    expect(Array.isArray(avisos.json().itens)).toBe(true)
    expect(avisos.json().itens.every((a: { status: string }) => a.status === 'programado')).toBe(true)
  })

  // ---- Suspensão de conta (owner) ----

  it('GET /admin/usuarios reflete suspenso (false por padrão)', async () => {
    const app = await criarAppTeste(owner)
    const r = await app.inject({ method: 'GET', url: `/v1/admin/usuarios?busca=Owner`, headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    const eu = r.json().itens.find((u: { id: string }) => u.id === owner)
    expect(eu.suspenso).toBe(false)
  })

  it('owner suspende usuário → próxima requisição autenticada dele = 403 conta_suspensa; reativar volta a 200', async () => {
    // Suspende o usuário comum.
    const appOwner = await criarAppTeste(owner)
    const sus = await appOwner.inject({
      method: 'PATCH', url: `/v1/admin/usuarios/${comum}`, headers: AUTH,
      payload: { suspenso: true },
    })
    await appOwner.close()
    expect(sus.statusCode).toBe(200)

    // Reflete na listagem.
    const appLista = await criarAppTeste(owner)
    const lista = await appLista.inject({ method: 'GET', url: `/v1/admin/usuarios?busca=Comum`, headers: AUTH })
    await appLista.close()
    const linha = lista.json().itens.find((u: { id: string }) => u.id === comum)
    expect(linha.suspenso).toBe(true)

    // Rota autenticada comum (não-admin) do usuário suspenso → 403 conta_suspensa.
    const appSus = await criarAppTeste(comum)
    const bloq = await appSus.inject({ method: 'GET', url: '/v1/perfil', headers: AUTH })
    await appSus.close()
    expect(bloq.statusCode).toBe(403)
    expect(bloq.json().error.code).toBe('conta_suspensa')

    // Reativa.
    const appReat = await criarAppTeste(owner)
    const reat = await appReat.inject({
      method: 'PATCH', url: `/v1/admin/usuarios/${comum}`, headers: AUTH,
      payload: { suspenso: false },
    })
    await appReat.close()
    expect(reat.statusCode).toBe(200)

    // Volta a funcionar.
    const appOk = await criarAppTeste(comum)
    const ok = await appOk.inject({ method: 'GET', url: '/v1/perfil', headers: AUTH })
    await appOk.close()
    expect(ok.statusCode).toBe(200)
  })

  it('owner não pode se auto-suspender → 422 auto_suspensao', async () => {
    const app = await criarAppTeste(owner)
    const r = await app.inject({
      method: 'PATCH', url: `/v1/admin/usuarios/${owner}`, headers: AUTH,
      payload: { suspenso: true },
    })
    await app.close()
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('auto_suspensao')
  })

  it('PATCH /admin/usuarios suspensão é owner-only → 403 para não-owner', async () => {
    const app = await criarAppTeste(comum)
    const r = await app.inject({
      method: 'PATCH', url: `/v1/admin/usuarios/${owner}`, headers: AUTH,
      payload: { suspenso: true },
    })
    await app.close()
    expect(r.statusCode).toBe(403)
  })

  it('GET /admin/metricas inclui opt-out e aceita período', async () => {
    const app = await criarAppTeste(owner)
    const r = await app.inject({ method: 'GET', url: '/v1/admin/metricas', headers: AUTH })
    const comPeriodo = await app.inject({
      method: 'GET', url: '/v1/admin/metricas?de=2020-01-01&ate=2020-12-31', headers: AUTH,
    })
    await app.close()
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body).toHaveProperty('avisos_por_status')
    expect(body).toHaveProperty('envios_por_status')
    expect(body).toHaveProperty('total_usuarios')
    expect(typeof body.optout_total).toBe('number')
    expect(typeof body.optout_taxa).toBe('number')
    expect(comPeriodo.statusCode).toBe(200)
  })

  // ---- Templates UNIFICADOS por chave (/admin/mensagens) ----

  it('owner lista mensagens (família resposta.* do seed)', async () => {
    const app = await criarAppTeste(owner)
    const r = await app.inject({ method: 'GET', url: '/v1/admin/mensagens', headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    const chaves = r.json().mensagens.map((m: { chave: string }) => m.chave)
    expect(chaves).toContain('resposta.ja_paguei')
    expect(chaves).toContain('resposta.ver_pix')
  })

  it('preview de mensagem renderiza {{n}} e linta texto + rótulo de botão', async () => {
    const app = await criarAppTeste(owner)
    const ok = await app.inject({
      method: 'POST', url: '/v1/admin/mensagens/preview', headers: AUTH,
      payload: { conteudo: { texto: 'Chave Pix: {{1}}', botoes: [{ acao: 'ver_pix', rotulo: 'Ver chave' }] }, variaveis: ['pix_chave'], valores: { pix_chave: 'ana@x.com' } },
    })
    const ruim = await app.inject({
      method: 'POST', url: '/v1/admin/mensagens/preview', headers: AUTH,
      payload: { conteudo: { texto: 'Ok', botoes: [{ acao: 'optout', rotulo: 'Sair da dívida' }] }, variaveis: [], valores: {} },
    })
    await app.close()
    expect(ok.json().render).toBe('Chave Pix: ana@x.com')
    expect(ok.json().lint_ok).toBe(true)
    expect(ruim.json().lint_ok).toBe(false) // termo proibido no rótulo do botão
  })

  // H12.7 / M1: PARIDADE preview↔envio no VALOR AUSENTE. O preview usa o mesmo
  // renderizador do zap (renderizarTexto): variável sem valor vira string VAZIA
  // (não o placeholder {{nome}}). O que o owner vê é o que vai sair.
  it('preview de variável SEM valor renderiza string vazia (não placeholder)', async () => {
    const app = await criarAppTeste(owner)
    const r = await app.inject({
      method: 'POST', url: '/v1/admin/mensagens/preview', headers: AUTH,
      payload: { conteudo: { texto: 'Oi {{1}}, sobre {{2}}' }, variaveis: ['nome', 'motivo'], valores: { motivo: 'mensalidade' } },
    })
    await app.close()
    expect(r.statusCode).toBe(200)
    // 'nome' ausente -> ''; 'motivo' presente. Igual ao envio real do zap.
    expect(r.json().render).toBe('Oi , sobre mensalidade')
  })

  it('criar mensagem com linguagem proibida → 422', async () => {
    const app = await criarAppTeste(owner)
    const r = await app.inject({
      method: 'POST', url: '/v1/admin/mensagens', headers: AUTH,
      payload: { chave: 'resposta.optout', conteudo: { texto: 'sobre sua dívida' }, variaveis: [] },
    })
    await app.close()
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('linguagem_proibida')
  })

  // H13.2: travessão BLOQUEIA ao salvar template (defesa junto do CHECK do banco).
  it('criar mensagem com travessão → 422 linguagem_travessao', async () => {
    const app = await criarAppTeste(owner)
    const r = await app.inject({
      method: 'POST', url: '/v1/admin/mensagens', headers: AUTH,
      payload: { chave: 'resposta.optout', conteudo: { texto: 'Oi — tudo certo' }, variaveis: [] },
    })
    await app.close()
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('linguagem_travessao')
  })

  // H13.2: hífen ASCII NÃO é travessão; mídia com URL e ação com hífen passam.
  it('preview com hífen ASCII (url/ação) não acende travessão', async () => {
    const app = await criarAppTeste(owner)
    const r = await app.inject({
      method: 'POST', url: '/v1/admin/mensagens/preview', headers: AUTH,
      payload: {
        conteudo: {
          texto: 'Acesse https://exemplo.com/a-b para pagar-agora',
          botoes: [{ acao: 'ver_pix', rotulo: 'Ver chave' }],
        },
        variaveis: [], valores: {},
      },
    })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().lint_ok).toBe(true)
    expect(r.json().travessao).toBeNull()
  })

  // H13.10 🟡 / H13.3: gênero gendered é só ALERTA. Salva mesmo assim e devolve
  // os trechos em avisos_genero (não bloqueia o salvamento).
  it('criar mensagem com texto gendered → 201, salva com avisos_genero', async () => {
    const app = await criarAppTeste(owner)
    const r = await app.inject({
      method: 'POST', url: '/v1/admin/mensagens', headers: AUTH,
      payload: {
        chave: 'resposta.optout',
        conteudo: { texto: 'Sou a Ana, falo sobre o combinado' }, variaveis: [],
      },
    })
    await app.close()
    expect(r.statusCode).toBe(201)
    const body = r.json()
    expect(Array.isArray(body.avisos_genero)).toBe(true)
    expect(body.avisos_genero.length).toBeGreaterThan(0) // "Sou a" acende o alerta

    // limpeza: o nome_meta é derivado pelo servidor; remove as versões propostas (versao>1).
    await poolSuper.query(`delete from public.templates where chave='resposta.optout' and versao > 1`)
  })

  // H13.10/H13.3: texto neutro não acende alerta de gênero.
  it('preview de texto neutro tem avisos_genero vazio', async () => {
    const app = await criarAppTeste(owner)
    const r = await app.inject({
      method: 'POST', url: '/v1/admin/mensagens/preview', headers: AUTH,
      payload: { conteudo: { texto: 'Aqui é Ana, sobre o combinado de pagamento.' }, variaveis: [], valores: {} },
    })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().avisos_genero).toEqual([])
  })

  it('propor versão (pendente) -> submeter à Meta -> (Meta aprova) -> ativar troca a ativa da chave', async () => {
    const app = await criarAppTeste(owner)
    const nova = await app.inject({
      method: 'POST', url: '/v1/admin/mensagens', headers: AUTH,
      payload: { chave: 'resposta.optout', conteudo: { texto: 'Pronto, sem mais lembretes.' }, variaveis: [] },
    })
    expect(nova.statusCode).toBe(201)
    const id = nova.json().id
    expect(nova.json().status_meta).toBe('pendente')
    expect(nova.json().ativo).toBe(false)
    // Nome derivado pelo servidor: base da versão ativa (resposta_optout) + próximo número.
    expect(nova.json().nome_meta).toBe('resposta_optout_2')
    expect(nova.json().versao).toBe(2)

    const semAprovar = await app.inject({ method: 'POST', url: `/v1/admin/mensagens/${id}/ativar`, headers: AUTH })
    expect(semAprovar.statusCode).toBe(409)
    expect(semAprovar.json().error.code).toBe('template_nao_aprovado')

    // Submeter à Meta: a api só ENFILEIRA (meta_acao='criar'); não aprova nada.
    const submeter = await app.inject({ method: 'POST', url: `/v1/admin/mensagens/${id}/submeter`, headers: AUTH })
    expect(submeter.statusCode).toBe(200)
    expect(submeter.json().meta_acao).toBe('criar')
    expect(submeter.json().status_meta).toBe('pendente')

    // Simula o zap (sincronizar_templates) refletindo a APROVAÇÃO real da Meta.
    await poolSuper.query(
      `update public.templates set status_meta='aprovado', meta_acao=null, meta_submetido_em=now() where id=$1`,
      [id],
    )
    const ativar = await app.inject({ method: 'POST', url: `/v1/admin/mensagens/${id}/ativar`, headers: AUTH })
    await app.close()
    expect(ativar.statusCode).toBe(200)

    const ativas = await poolSuper.query(
      `select id from public.templates where chave='resposta.optout' and contexto='padrao' and ativo`,
    )
    expect(ativas.rowCount).toBe(1)
    expect(ativas.rows[0].id).toBe(id)

    // limpeza: reativa o seed e remove as versões de teste (nome derivado -> por versao).
    await poolSuper.query(`update public.templates set ativo=false where id=$1`, [id])
    await poolSuper.query(
      `update public.templates set ativo=true where chave='resposta.optout' and nome_meta='resposta_optout'`,
    )
    await poolSuper.query(`delete from public.templates where chave='resposta.optout' and versao > 1`)
  })

  // H13.4: opt-out visível em TODA mensagem do ciclo. "Templates do ciclo" = as
  // chaves 'ciclo.*' (lembretes D-2..D+1 e suas variantes de revisão), que são as
  // mensagens enviadas repetidamente ao devedor. Cada uma DEVE declarar o botão
  // de opt-out (acao='optout'); o rótulo é editável (E12), a presença não é opcional.
  it('todo template do ciclo carrega o botão de opt-out', async () => {
    const { rows } = await poolSuper.query<{ chave: string; tem_optout: boolean }>(
      `select chave,
              exists (
                select 1 from jsonb_array_elements(conteudo->'botoes') b
                where b->>'acao' = 'optout'
              ) as tem_optout
       from public.templates
       where chave like 'ciclo.%'`,
    )
    expect(rows.length).toBeGreaterThan(0) // há templates de ciclo semeados
    const semOptout = rows.filter((r) => !r.tem_optout).map((r) => r.chave)
    expect(semOptout, `templates do ciclo sem opt-out: ${semOptout.join(', ')}`).toEqual([])
  })

  it('apagar a versão ativa de uma chave → 409 template_ativo', async () => {
    const app = await criarAppTeste(owner)
    const ativa = await poolSuper.query(
      `select id from public.templates where chave='resposta.ja_paguei' and ativo limit 1`,
    )
    const r = await app.inject({
      method: 'DELETE', url: `/v1/admin/mensagens/${ativa.rows[0].id}`, headers: AUTH,
    })
    await app.close()
    expect(r.statusCode).toBe(409)
    expect(r.json().error.code).toBe('template_ativo')
  })
})
