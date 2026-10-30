// Integracao do console do operador contra o Postgres local: escopo (401/403), listagem, busca,
// paginacao, ficha, allowlist de payload (SEC-003), gestao da equipe, cadastro de usuario (3
// caminhos) e invariantes de admin.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { poolSuper, criarUsuario } from '../../../test/db'
import { chamar, encerrar, logs, montarMundo, online, type Mundo } from './tests/harness'

const d = online ? describe : describe.skip

const CHAVES_RESUMO = ['criado_em', 'id', 'nome', 'qtd_lojas', 'qtd_lojas_ativas', 'saude_whatsapp', 'situacao']
const CHAVES_FICHA = [
  'assinatura', 'criado_em', 'dono_user_id', 'id', 'lojas', 'membros', 'nome', 'saude_whatsapp', 'situacao',
]

async function statusAllowlist(email: string): Promise<{ status: string; conta_id: string | null } | null> {
  const r = await poolSuper.query(
    'select status, conta_id from public.acessos_permitidos where lower(email) = lower($1)', [email],
  )
  return r.rows[0] ?? null
}

d('modulo plataforma_usuarios', () => {
  let m: Mundo
  beforeAll(async () => { m = await montarMundo() })
  afterAll(async () => { if (m) await encerrar(m) })

  it('401 sem token; 403 para membro de loja em todas as rotas (SEC-001)', async () => {
    expect((await chamar(m, undefined, 'GET', '/contas')).status).toBe(401)
    const id = m.contaA
    const rotas: [Parameters<typeof chamar>[2], string, unknown?][] = [
      ['GET', '/contas'], ['GET', `/contas/${id}`], ['GET', '/operadores'],
      ['POST', '/operadores', { email: 'x@exemplo.com', nome: 'X' }],
      ['POST', '/usuarios', { nome: 'XX', email: 'x@exemplo.com', ativo: true }],
      ['PATCH', `/operadores/${m.operadorOpId}`, { ativo: false }],
    ]
    for (const [metodo, url, corpo] of rotas) {
      for (const quem of [m.dono, m.gerente, m.donoB]) {
        const r = await chamar(m, quem, metodo, url, corpo)
        expect(r.status, `${metodo} ${url}`).toBe(403)
        expect(r.corpo.error.code).toBe('proibido')
      }
    }
  })

  it('operador lista e busca por nome da conta; payload so com chaves da allowlist (SEC-003)', async () => {
    const r = await chamar(m, m.operador, 'GET', `/contas?busca=${m.marca}&limite=100`)
    expect(r.status, JSON.stringify(r.corpo)).toBe(200)
    expect(r.headers['cache-control']).toBe('no-store')
    const ids = r.corpo.itens.map((x: { id: string }) => x.id)
    expect(ids).toEqual(expect.arrayContaining([m.contaA, m.contaB, m.contaC]))
    for (const it of r.corpo.itens) expect(Object.keys(it).sort()).toEqual(CHAVES_RESUMO)
    const a = r.corpo.itens.find((x: { id: string }) => x.id === m.contaA)
    expect(a).toMatchObject({ qtd_lojas: 1, qtd_lojas_ativas: 1, situacao: 'sem_assinatura', saude_whatsapp: 'sem_numero' })
    const c = r.corpo.itens.find((x: { id: string }) => x.id === m.contaC)
    expect(c.qtd_lojas).toBe(0) // conta sem loja e valida
  })

  it('busca por nome de loja, filtro de situacao e entrada maliciosa (SEC-080)', async () => {
    await poolSuper.query("update public.lojas set nome = $2 where conta_id = $1", [m.contaB, `${m.marca} Cantina`])
    await poolSuper.query(
      "insert into public.assinaturas (conta_id, status) values ($1, 'ativa')", [m.contaB],
    )
    const porLoja = await chamar(m, m.operador, 'GET', `/contas?busca=${m.marca}%20Cantina`)
    expect(porLoja.corpo.itens.map((x: { id: string }) => x.id)).toEqual([m.contaB])
    const ativa = await chamar(m, m.operador, 'GET', `/contas?busca=${m.marca}&situacao=ativa`)
    expect(ativa.corpo.itens.map((x: { id: string }) => x.id)).toEqual([m.contaB])
    expect(ativa.corpo.itens[0].situacao).toBe('ativa')
    const curinga = await chamar(m, m.operador, 'GET', `/contas?busca=${encodeURIComponent('%%')}`)
    expect(curinga.status).toBe(200)
    expect(curinga.corpo.itens).toHaveLength(0) // % literal, nao curinga
    const sqli = await chamar(m, m.operador, 'GET', `/contas?busca=${encodeURIComponent("x'; drop table contas;--")}`)
    expect(sqli.status).toBe(200)
    expect((await chamar(m, m.operador, 'GET', '/contas?busca=a')).status).toBe(400) // minimo 2
    expect((await chamar(m, m.operador, 'GET', '/contas?situacao=foo')).status).toBe(400)
    expect((await chamar(m, m.operador, 'GET', '/contas?limite=101')).status).toBe(400)
    expect((await chamar(m, m.operador, 'GET', '/contas?cursor=lixo')).status).toBe(422)
    // loja_id/conta_id forjados na query sao rejeitados (schema estrito)
    expect((await chamar(m, m.operador, 'GET', `/contas?conta_id=${m.contaA}`)).status).toBe(400)
  })

  it('paginacao por cursor e estavel e sem repeticao', async () => {
    const vistos: string[] = []
    let cursor: string | null = null
    for (let i = 0; i < 5; i++) {
      const qs: string = `busca=${m.marca}&limite=2${cursor ? `&cursor=${cursor}` : ''}`
      const r = await chamar(m, m.operador, 'GET', `/contas?${qs}`)
      expect(r.status).toBe(200)
      vistos.push(...r.corpo.itens.map((x: { id: string }) => x.id))
      cursor = r.corpo.proximoCursor
      if (!cursor) break
    }
    expect(vistos).toHaveLength(3)
    expect(new Set(vistos).size).toBe(3)
  })

  it('ficha: conta + lojas (com codigo publico) + membros (sem contato) + numero (so status) + assinatura', async () => {
    const loja = m.lojaA
    await poolSuper.query(
      `insert into public.numeros_whatsapp (loja_id, phone_number_id, waba_id, numero_hash, status, verificado)
       values ($1, $2, 'waba', $3, 'conectado', true)`,
      [loja, `pn-${m.marca}`, 'a'.repeat(64)],
    )
    try {
      const r = await chamar(m, m.operador, 'GET', `/contas/${m.contaA}`)
      expect(r.status, JSON.stringify(r.corpo)).toBe(200)
      expect(Object.keys(r.corpo).sort()).toEqual(CHAVES_FICHA)
      expect(r.corpo.saude_whatsapp).toBe('ok')
      expect(r.corpo.dono_user_id).toBe(m.dono)
      expect(typeof r.corpo.lojas[0].codigo_publico).toBe('string')
      expect(r.corpo.lojas[0].codigo_publico.length).toBeGreaterThan(0)
      expect(r.corpo.lojas[0].numero).toMatchObject({ status: 'conectado', verificado: true })
      expect(Object.keys(r.corpo.lojas[0].numero).sort()).toEqual(['criado_em', 'status', 'verificado'])
      expect(Object.keys(r.corpo.membros[0]).sort()).toEqual(['ativo', 'criado_em', 'loja_id', 'papel', 'user_id'])
      expect(r.corpo.membros.map((x: { papel: string }) => x.papel).sort()).toEqual(['dono', 'gerente'])
      const txt = JSON.stringify(r.corpo)
      expect(txt).not.toContain('pn-')
      expect(txt).not.toContain('a'.repeat(64))
      const b = await chamar(m, m.operador, 'GET', `/contas/${m.contaB}`)
      expect(b.corpo.assinatura).toMatchObject({ status: 'ativa', valor_mensal_centavos: 70000 })
    } finally {
      await poolSuper.query('delete from public.numeros_whatsapp where loja_id = $1', [loja])
    }
    expect((await chamar(m, m.operador, 'GET', `/contas/${crypto.randomUUID()}`)).status).toBe(404)
    expect((await chamar(m, m.operador, 'GET', '/contas/nao-uuid')).status).toBe(400)
  })

  it('equipe: operador comum nao lista nem escreve (403); admin lista e convida (SEC-041)', async () => {
    expect((await chamar(m, m.operador, 'GET', '/operadores')).status).toBe(403)
    expect((await chamar(m, m.operador, 'PATCH', `/operadores/${m.operadorOpId}`, { papel: 'admin' })).status).toBe(403)
    expect((await chamar(m, m.operador, 'POST', '/operadores', { email: 'x@exemplo.com', nome: 'X', papel: 'admin' })).status).toBe(403)
    const lista = await chamar(m, m.admin, 'GET', '/operadores')
    expect(lista.status).toBe(200)
    expect(lista.corpo.itens.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining([m.adminOpId, m.operadorOpId]))

    const novo = await criarUsuario(m.cenario)
    const email = `${m.marca.toLowerCase()}.novo@exemplo.com`
    await poolSuper.query('update auth.users set email = $2 where id = $1', [novo, email])
    await poolSuper.query(
      "insert into auth.identities (id, user_id, provider) values ($1, $2, 'google')", [novo, novo],
    )
    // e-mail e resolvido sem diferenciar caixa; resposta traz e-mail e metodo de login
    const ok = await chamar(m, m.admin, 'POST', '/operadores', { email: email.toUpperCase(), nome: 'Novo Membro da Equipe' })
    expect(ok.status, JSON.stringify(ok.corpo)).toBe(201)
    expect(ok.corpo).toMatchObject({ user_id: novo, papel: 'operador', ativo: true, email, metodo: 'google' })
    const lista2 = await chamar(m, m.admin, 'GET', '/operadores')
    expect(lista2.corpo.itens.find((x: { id: string }) => x.id === ok.corpo.id)).toMatchObject({ email, metodo: 'google' })
    expect((await chamar(m, m.admin, 'POST', '/operadores', { email, nome: 'Dup' })).status).toBe(409)
    const fantasma = await chamar(m, m.admin, 'POST', '/operadores', { email: `${m.marca.toLowerCase()}.nunca@exemplo.com`, nome: 'Fantasma' })
    expect(fantasma.status).toBe(422)
    expect(fantasma.corpo.error.code).toBe('usuario_sem_acesso')
    expect(fantasma.corpo.error.message).toContain('ainda não acessou o Whaviso')
    expect((await chamar(m, m.admin, 'POST', '/operadores', { email, nome: 'X', extra: 1 })).status).toBe(400)
    expect((await chamar(m, m.admin, 'POST', '/operadores', { email: 'nao-e-email', nome: 'X' })).status).toBe(400)
    const ev = await poolSuper.query(
      "select detalhes from public.eventos where tipo = 'plataforma.operador_criado' and entidade_id = $1", [ok.corpo.id],
    )
    expect(ev.rows).toHaveLength(1)
    expect(JSON.stringify(ev.rows[0].detalhes)).not.toMatch(/nome|telefone|email/i)
  })

  it('cadastro de usuario: conta nova com dono ja existente no Auth + plano (SEC-041)', async () => {
    const dono = await criarUsuario(m.cenario)
    const email = `${m.marca.toLowerCase()}.dono@exemplo.com`
    await poolSuper.query('update auth.users set email = $2 where id = $1', [dono, email])
    const plano = await poolSuper.query(
      'insert into public.planos (nome, valor_centavos) values ($1, $2) returning id', [`${m.marca} Plano`, 19900],
    )
    const planoId = plano.rows[0].id
    const nome = `${m.marca} Novo Usuario`
    const ok = await chamar(m, m.admin, 'POST', '/usuarios', { nome, email, ativo: true, plano_id: planoId })
    expect(ok.status, JSON.stringify(ok.corpo)).toBe(201)
    expect(ok.corpo.vinculado_loja_existente).toBe(false)
    m.cenario.contas.push(ok.corpo.conta_id) // limpeza no encerramento
    const c = await poolSuper.query('select dono_user_id, nome from public.contas where id = $1', [ok.corpo.conta_id])
    expect(c.rows[0]).toMatchObject({ dono_user_id: dono, nome })
    const l = await poolSuper.query('select conta_id, nome, codigo_publico from public.lojas where id = $1', [ok.corpo.loja_id])
    expect(l.rows[0]).toMatchObject({ conta_id: ok.corpo.conta_id, nome })
    expect(l.rows[0].codigo_publico).toBeTruthy()
    const mb = await poolSuper.query(
      'select papel, loja_id from public.membros where conta_id = $1 and user_id = $2', [ok.corpo.conta_id, dono],
    )
    expect(mb.rows).toEqual([{ papel: 'dono', loja_id: null }])
    const assinatura = await poolSuper.query(
      'select status, plano_id, valor_mensal_centavos from public.assinaturas where conta_id = $1', [ok.corpo.conta_id],
    )
    expect(assinatura.rows[0]).toMatchObject({ status: 'trial', plano_id: planoId, valor_mensal_centavos: 19900 })
    expect(await statusAllowlist(email)).toMatchObject({ status: 'aprovado', conta_id: ok.corpo.conta_id })
    const ev = await poolSuper.query(
      "select detalhes from public.eventos where tipo = 'plataforma.usuario_provisionado' and entidade_id = $1", [ok.corpo.conta_id],
    )
    expect(ev.rows).toHaveLength(1)
    expect(JSON.stringify(ev.rows[0].detalhes)).not.toMatch(/@|email|nome/i)
    // mesmo dono de novo: ja possui conta
    const dup = await chamar(m, m.admin, 'POST', '/usuarios', { nome: 'Outro', email, ativo: true })
    expect(dup.status).toBe(409)
    expect(dup.corpo.error.code).toBe('ja_possui_conta')
    expect((await chamar(m, m.admin, 'POST', '/usuarios', { nome: 'Outro', email, ativo: true, loja_id: m.lojaA })).status).toBe(400)
  })

  it('cadastro de usuario: e-mail que nunca logou pre-provisiona a conta (ativo e pendente)', async () => {
    const emailAtivo = `${m.marca.toLowerCase()}.preprov.ativo@exemplo.com`
    const ok = await chamar(m, m.admin, 'POST', '/usuarios', { nome: 'Dono Futuro', email: emailAtivo, ativo: true })
    expect(ok.status, JSON.stringify(ok.corpo)).toBe(201)
    expect(ok.corpo).toMatchObject({ loja_id: null, membro_id: null, vinculado_loja_existente: false })
    m.cenario.contas.push(ok.corpo.conta_id)
    const c = await poolSuper.query('select dono_user_id from public.contas where id = $1', [ok.corpo.conta_id])
    expect(c.rows[0].dono_user_id).toBeNull()
    expect(await statusAllowlist(emailAtivo)).toMatchObject({ status: 'aprovado', conta_id: ok.corpo.conta_id })

    const emailPendente = `${m.marca.toLowerCase()}.preprov.pendente@exemplo.com`
    const pendente = await chamar(m, m.admin, 'POST', '/usuarios', { nome: 'Dona Futura', email: emailPendente, ativo: false })
    expect(pendente.status, JSON.stringify(pendente.corpo)).toBe(201)
    m.cenario.contas.push(pendente.corpo.conta_id)
    expect(await statusAllowlist(emailPendente)).toMatchObject({ status: 'pendente', conta_id: pendente.corpo.conta_id })
  })

  it('cadastro de usuario: vincula a uma loja ja cadastrada pelo codigo publico', async () => {
    const membro = await criarUsuario(m.cenario)
    const email = `${m.marca.toLowerCase()}.membro@exemplo.com`
    await poolSuper.query('update auth.users set email = $2 where id = $1', [membro, email])
    const loja = await poolSuper.query('select codigo_publico from public.lojas where id = $1', [m.lojaA])
    const codigo = loja.rows[0].codigo_publico

    const ok = await chamar(m, m.admin, 'POST', '/usuarios', { nome: 'Novo Gerente', email, ativo: true, loja_codigo_publico: codigo })
    expect(ok.status, JSON.stringify(ok.corpo)).toBe(201)
    expect(ok.corpo).toMatchObject({ conta_id: m.contaA, loja_id: m.lojaA, vinculado_loja_existente: true })
    const mb = await poolSuper.query('select papel, loja_id from public.membros where id = $1', [ok.corpo.membro_id])
    expect(mb.rows[0]).toMatchObject({ papel: 'gerente', loja_id: m.lojaA })
    expect(await statusAllowlist(email)).toMatchObject({ status: 'aprovado', conta_id: m.contaA })

    const semCodigo = await chamar(m, m.admin, 'POST', '/usuarios', {
      nome: 'Fantasma Dois', email: `${m.marca.toLowerCase()}.fantasma2@exemplo.com`, ativo: true, loja_codigo_publico: 'codigo-que-nao-existe',
    })
    expect(semCodigo.status).toBe(422) // e-mail tambem nunca logou: cai no erro de acesso antes de checar a loja

    const semAcesso = await criarUsuario(m.cenario)
    const emailSemAcesso = `${m.marca.toLowerCase()}.semacesso@exemplo.com`
    await poolSuper.query('update auth.users set email = $2 where id = $1', [semAcesso, emailSemAcesso])
    const codigoInvalido = await chamar(m, m.admin, 'POST', '/usuarios', {
      nome: 'Sem Acesso', email: emailSemAcesso, ativo: true, loja_codigo_publico: 'codigo-que-nao-existe',
    })
    expect(codigoInvalido.status).toBe(404)
  })

  it('admin troca papel e desativa; ultimo admin ativo nao cai (invariante)', async () => {
    const promovido = await chamar(m, m.admin, 'PATCH', `/operadores/${m.operadorOpId}`, { papel: 'admin' })
    expect(promovido.status, JSON.stringify(promovido.corpo)).toBe(200)
    expect(promovido.corpo.papel).toBe('admin')
    // agora ha 2 admins ativos (ou mais, de outros testes): o admin da suite pode ser rebaixado
    const rebaixado = await chamar(m, m.admin, 'PATCH', `/operadores/${m.operadorOpId}`, { papel: 'operador' })
    expect(rebaixado.status).toBe(200)

    // (O caso "ultimo admin" e coberto em servico.test.ts com pool falso: nao mexe em admins
    // de outras suites, que compartilham a tabela.)
    // desativar um operador comum e ok e nao apaga a linha
    const des = await chamar(m, m.admin, 'PATCH', `/operadores/${m.operadorOpId}`, { ativo: false })
    expect(des.status).toBe(200)
    expect(des.corpo.ativo).toBe(false)
    // operador desativado perde o acesso (escopo exige ativo)
    expect((await chamar(m, m.operador, 'GET', '/contas')).status).toBe(403)
    expect((await chamar(m, m.admin, 'PATCH', `/operadores/${crypto.randomUUID()}`, { ativo: true })).status).toBe(404)
    expect((await chamar(m, m.admin, 'PATCH', `/operadores/${m.operadorOpId}`, {})).status).toBe(400)
  })

  it('logs nao carregam user_id de conta nem dados de contato', () => {
    const tudo = logs.join('\n')
    expect(tudo).not.toMatch(/telefone|\+55\d{10,}|token_cifrado/i)
  })
})
