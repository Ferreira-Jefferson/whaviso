// Unidade do servico (sem banco): invariante "ultimo admin" e anti autopromocao, com pool falso.
import { describe, it, expect } from 'vitest'
import type { Pool } from '@whaviso/shared/db'
import { criarServicoPlataformaClientes } from './service'

const U_ADMIN = '11111111-1111-4111-8111-111111111111'
const ID_ADMIN = '22222222-2222-4222-8222-222222222222'

interface Cenario { admins: string[]; alvo: Record<string, unknown> | null }

/** Pool falso: responde por trecho do SQL; registra se houve commit/rollback. */
function poolFalso(c: Cenario) {
  const eventos: string[] = []
  const client = {
    async query(texto: string) {
      if (/^(begin|commit|rollback)/i.test(texto)) { eventos.push(texto.split(' ')[0]!.toLowerCase()); return { rows: [] } }
      if (/for update/i.test(texto)) return { rows: c.admins.map((id) => ({ id })) }
      if (/^\s*select/i.test(texto)) return { rows: c.alvo ? [c.alvo] : [] }
      if (/^\s*update/i.test(texto)) return { rows: [{ ...c.alvo, papel: 'operador', ativo: false }] }
      return { rows: [] }
    },
    release() {},
  }
  // leituras fora da transacao (auth info) usam pool.query: devolvem vazio
  const pool = { connect: async () => client, query: async () => ({ rows: [] }) } as unknown as Pool
  return { pool, eventos }
}

const adminAlvo = { id: ID_ADMIN, user_id: U_ADMIN, nome: 'A', papel: 'admin', ativo: true, criado_em: '2026-01-01T00:00:00.000000Z' }

describe('plataforma_clientes: invariantes da equipe', () => {
  it('nao desativa nem rebaixa o ultimo admin ativo (422 ultimo_admin) e da rollback', async () => {
    for (const patch of [{ ativo: false }, { papel: 'operador' as const }]) {
      const { pool, eventos } = poolFalso({ admins: [ID_ADMIN], alvo: adminAlvo })
      const svc = criarServicoPlataformaClientes(pool)
      await expect(svc.alterarOperador({ userId: U_ADMIN, papel: 'admin' }, ID_ADMIN, patch))
        .rejects.toMatchObject({ statusCode: 422, code: 'ultimo_admin' })
      expect(eventos).toContain('rollback')
    }
  })

  it('com 2 admins ativos permite rebaixar um deles', async () => {
    const { pool, eventos } = poolFalso({ admins: [ID_ADMIN, 'outro'], alvo: adminAlvo })
    const svc = criarServicoPlataformaClientes(pool)
    const r = await svc.alterarOperador({ userId: U_ADMIN, papel: 'admin' }, ID_ADMIN, { papel: 'operador' })
    expect(r.papel).toBe('operador')
    expect(eventos).toContain('commit')
  })

  it('operador nao se autopromove a admin (403)', async () => {
    const alvo = { ...adminAlvo, papel: 'operador' }
    const { pool } = poolFalso({ admins: [ID_ADMIN], alvo })
    const svc = criarServicoPlataformaClientes(pool)
    await expect(svc.alterarOperador({ userId: U_ADMIN, papel: 'operador' }, ID_ADMIN, { papel: 'admin' }))
      .rejects.toMatchObject({ statusCode: 403 })
  })
})
