// Integracao do console do operador contra o Postgres local: escopo (401/403), listagem, busca,
// paginacao, ficha, allowlist de payload (SEC-003), gestao da equipe e invariantes de admin.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { poolSuper, criarUsuario } from '../../../test/db'
import { chamar, encerrar, logs, montarMundo, online, type Mundo } from './tests/harness'

const d = online ? describe : describe.skip

const CHAVES_RESUMO = ['criado_em', 'id', 'nome', 'qtd_lojas', 'qtd_lojas_ativas', 'saude_whatsapp', 'situacao']
const CHAVES_FICHA = [
  'assinatura', 'criado_em', 'dono_user_id', 'id', 'lojas', 'membros', 'nome', 'saude_whatsapp', 'situacao',
]

d('modulo plataforma_clientes', () => {
  let m: Mundo
  beforeAll(async () => { m = await montarMundo() })
  afterAll(async () => { if (m) await encerrar(m) })

  it('401 sem token; 403 para membro de loja em todas as rotas (SEC-001)', async () => {
    expect((await chamar(m, undefined, 'GET', '/contas')).status).toBe(401)
    const id = m.contaA
    const rotas: [Parameters<typeof chamar>[2], string, unknown?][] = [
      ['GET', '/contas'], ['GET', `/contas/${id}`], ['GET', '/operadores'],
      ['POST', '/operadores', { email: 'x@exemplo.com', nome: 'X' }],
      ['POST', '/contas', { nome_restaurante: 'Novo', email_dono: 'x@exemplo.com' }],
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

  it('ficha: conta + lojas + membros (sem contato) + numero (so status) + assinatura', async () => {
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

  it('admin provisiona cliente por e-mail do dono: conta + loja + dono (SEC-041)', async () => {
    const dono = await criarUsuario(m.cenario)
    const email = `${m.marca.toLowerCase()}.dono@exemplo.com`
    await poolSuper.query('update auth.users set email = $2 where id = $1', [dono, email])
    const nome = `${m.marca} Novo Cliente`
    const ok = await chamar(m, m.admin, 'POST', '/contas', { nome_restaurante: nome, email_dono: email })
    expect(ok.status, JSON.stringify(ok.corpo)).toBe(201)
    m.cenario.contas.push(ok.corpo.conta_id) // limpeza no encerramento
    const c = await poolSuper.query('select dono_user_id, nome from public.contas where id = $1', [ok.corpo.conta_id])
    expect(c.rows[0]).toMatchObject({ dono_user_id: dono, nome })
    const l = await poolSuper.query('select conta_id, nome from public.lojas where id = $1', [ok.corpo.loja_id])
    expect(l.rows[0]).toMatchObject({ conta_id: ok.corpo.conta_id, nome })
    const mb = await poolSuper.query(
      'select papel, loja_id from public.membros where conta_id = $1 and user_id = $2', [ok.corpo.conta_id, dono],
    )
    expect(mb.rows).toEqual([{ papel: 'dono', loja_id: null }])
    const ev = await poolSuper.query(
      "select detalhes from public.eventos where tipo = 'plataforma.cliente_provisionado' and entidade_id = $1", [ok.corpo.conta_id],
    )
    expect(ev.rows).toHaveLength(1)
    expect(JSON.stringify(ev.rows[0].detalhes)).not.toMatch(/@|email|nome/i)
    // mesmo dono de novo: ja possui conta
    const dup = await chamar(m, m.admin, 'POST', '/contas', { nome_restaurante: 'Outro', email_dono: email })
    expect(dup.status).toBe(409)
    expect(dup.corpo.error.code).toBe('ja_possui_conta')
    // e-mail inexistente no Auth: mensagem clara; corpo estrito (sem loja_id)
    const sem = await chamar(m, m.admin, 'POST', '/contas', { nome_restaurante: 'Outro', email_dono: `${m.marca.toLowerCase()}.zz@exemplo.com` })
    expect(sem.status).toBe(422)
    expect(sem.corpo.error.code).toBe('usuario_sem_acesso')
    expect((await chamar(m, m.admin, 'POST', '/contas', { nome_restaurante: 'Outro', email_dono: email, loja_id: m.lojaA })).status).toBe(400)
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
