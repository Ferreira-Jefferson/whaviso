// Integracao (role whaviso_api): helper compartilhado da outbox de e-mail + aprovacao do dono por
// pagamento (migration 0082). Prova: aprova o dono e enfileira o boas-vindas uma vez (idempotente);
// sem e-mail do dono e no-op.
import { randomUUID } from 'node:crypto'
import { describe, it, expect, afterAll } from 'vitest'
import {
  bancoAcessivel, criarConta, criarUsuario, fecharPools, limpar, novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { aprovarDonoPorPagamento, enfileirarBoasVindas } from './index'

const online = await bancoAcessivel()
const d = online ? describe : describe.skip

d('emails_outbox: helper + aprovacao por pagamento (integracao)', () => {
  const c = novoCenario()
  const emails: string[] = []

  afterAll(async () => {
    for (const e of emails) {
      await poolSuper.query('delete from public.emails_outbox where para = $1', [e]).catch(() => {})
      await poolSuper.query('delete from public.acessos_permitidos where email = $1', [e]).catch(() => {})
    }
    await limpar(c)
    await fecharPools()
  })

  async function contaComDono(email: string | null): Promise<{ contaId: string }> {
    const dono = await criarUsuario(c)
    if (email) await poolSuper.query('update auth.users set email = $2 where id = $1', [dono, email])
    const contaId = await criarConta(c, dono)
    return { contaId }
  }

  it('enfileirarBoasVindas e idempotente por dedupe', async () => {
    const email = `obx.${randomUUID().slice(0, 8)}@exemplo.com`
    emails.push(email)
    expect(await enfileirarBoasVindas(poolApi, email)).toBe(true)
    expect(await enfileirarBoasVindas(poolApi, email)).toBe(false)
    const { rows } = await poolSuper.query('select count(*)::int as n from public.emails_outbox where para = $1', [email])
    expect(rows[0].n).toBe(1)
  })

  it('aprovarDonoPorPagamento aprova o dono e enfileira o boas-vindas (uma vez)', async () => {
    const email = `obx.pag.${randomUUID().slice(0, 8)}@exemplo.com`
    emails.push(email)
    const { contaId } = await contaComDono(email)

    expect(await aprovarDonoPorPagamento(poolApi, contaId)).toBe(true)
    const ac = await poolSuper.query(
      'select status, origem, conta_id, boas_vindas_enviado_em from public.acessos_permitidos where lower(email) = lower($1)',
      [email],
    )
    expect(ac.rows[0]).toMatchObject({ status: 'aprovado', origem: 'pagamento', conta_id: contaId })
    expect(ac.rows[0].boas_vindas_enviado_em).not.toBeNull()
    const ob = await poolSuper.query('select template from public.emails_outbox where para = $1', [email])
    expect(ob.rows.map((r) => r.template)).toEqual(['boas_vindas'])

    // Idempotente: segunda baixa nao reenfileira.
    expect(await aprovarDonoPorPagamento(poolApi, contaId)).toBe(true)
    const ob2 = await poolSuper.query('select count(*)::int as n from public.emails_outbox where para = $1', [email])
    expect(ob2.rows[0].n).toBe(1)
  })

  it('dono sem e-mail no Auth: no-op (false), sem aprovar nada', async () => {
    const { contaId } = await contaComDono(null)
    expect(await aprovarDonoPorPagamento(poolApi, contaId)).toBe(false)
    const ac = await poolSuper.query('select 1 from public.acessos_permitidos where conta_id = $1', [contaId])
    expect(ac.rows).toHaveLength(0)
  })
})
