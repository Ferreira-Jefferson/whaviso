// Integracao: gate da allowlist de login no bootstrap de conta (migration 0082). Prova:
//   - e-mail APROVADO passa (cria a 1a conta);
//   - e-mail nao aprovado (pendente/ausente) e barrado com `acesso_nao_aprovado` (403);
//   - convidado de outra conta NAO e afetado pelo gate (cai em `ja_possui_conta`, 409).
import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { bancoAcessivel, fecharPools, limpar } from '../../../test/db'
import {
  criarAppConta,
  type App,
  criarChamador,
  criarMembro,
  criarUsuario,
  montar,
  novoCenario,
  poolSuper,
} from './harness'

const online = await bancoAcessivel()
const d = online ? describe : describe.skip

/** Semeia o e-mail do usuario no Auth (o gate resolve via plataforma_auth_info). */
async function definirEmail(userId: string, email: string): Promise<void> {
  await poolSuper.query('update auth.users set email = $2 where id = $1', [userId, email])
}

/** Insere um e-mail na allowlist com um status dado. */
async function semearAcesso(email: string, status: 'pendente' | 'aprovado' | 'revogado'): Promise<void> {
  const aprovadoEm = status === 'aprovado' ? new Date() : null
  await poolSuper.query(
    `insert into public.acessos_permitidos (email, status, origem, aprovado_em)
     values ($1, $2, 'admin', $3)`,
    [email, status, aprovadoEm],
  )
}

d('gate de allowlist de login no POST /conta (integracao)', () => {
  let app: App
  let chamar: ReturnType<typeof criarChamador>
  const c = novoCenario()
  const emailsCriados: string[] = []

  beforeAll(async () => {
    app = await criarAppConta()
    chamar = criarChamador(app)
  })
  afterAll(async () => {
    await app?.close()
    for (const e of emailsCriados) {
      await poolSuper.query('delete from public.acessos_permitidos where email = $1', [e]).catch(() => {})
    }
    await limpar(c)
    await fecharPools()
  })

  it('e-mail APROVADO cria a 1a conta (201)', async () => {
    const u = await criarUsuario(c)
    const email = `gate.ok.${randomUUID().slice(0, 8)}@exemplo.com`
    await definirEmail(u, email)
    await semearAcesso(email, 'aprovado')
    emailsCriados.push(email)

    const r = await chamar(u, 'POST', '/', { nome: 'Restaurante Liberado' })
    expect(r.statusCode).toBe(201)
    c.contas.push(r.json().id)
  })

  it('e-mail PENDENTE e barrado com acesso_nao_aprovado (403)', async () => {
    const u = await criarUsuario(c)
    const email = `gate.pend.${randomUUID().slice(0, 8)}@exemplo.com`
    await definirEmail(u, email)
    await semearAcesso(email, 'pendente')
    emailsCriados.push(email)

    const r = await chamar(u, 'POST', '/', { nome: 'Nao liberado' })
    expect(r.statusCode).toBe(403)
    expect(r.json().error.code).toBe('acesso_nao_aprovado')
    // Nao criou conta.
    const { rows } = await poolSuper.query('select 1 from public.contas where dono_user_id = $1', [u])
    expect(rows).toHaveLength(0)
  })

  it('usuario SEM e-mail no Auth e barrado (403)', async () => {
    const u = await criarUsuario(c) // sem email
    const r = await chamar(u, 'POST', '/', { nome: 'Sem email' })
    expect(r.statusCode).toBe(403)
    expect(r.json().error.code).toBe('acesso_nao_aprovado')
  })

  it('convidado de outra conta NAO e afetado pelo gate (ja_possui_conta, 409)', async () => {
    const base = await montar(c) // conta com dono + lojas
    const convidado = await criarUsuario(c)
    // Sem e-mail e sem allowlist: se o gate rodasse antes, daria 403. Como e membro, da 409.
    await criarMembro(base.contaId, convidado, 'gerente', base.lojaA)

    const r = await chamar(convidado, 'POST', '/', { nome: 'Segunda conta' })
    expect(r.statusCode).toBe(409)
    expect(r.json().error.code).toBe('ja_possui_conta')
  })
})
