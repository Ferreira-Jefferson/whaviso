import { describe, expect, it } from 'vitest'
import { sql, sqlBruto, ehConsulta } from './sql'
import { ErroBanco, traduzirErroPg } from './erros'
import { comTransacao, consultar, type Executor, type Pool, type PoolClient } from './index'

describe('sql tagged template (SEC-080)', () => {
  it('valores viram parametros, nunca texto', () => {
    const malicioso = "x'; drop table pedidos; --"
    const q = sql`select * from t where a = ${malicioso} and b = ${7}`
    expect(q.text).toBe('select * from t where a = $1 and b = $2')
    expect(q.values).toEqual([malicioso, 7])
    expect(q.text).not.toContain('drop')
  })

  it('fragmentos aninhados renumeram placeholders', () => {
    const filtro = sql`b = ${2} and c = ${3}`
    const q = sql`select 1 where a = ${1} and ${filtro} and d = ${4}`
    expect(q.text).toBe('select 1 where a = $1 and b = $2 and c = $3 and d = $4')
    expect(q.values).toEqual([1, 2, 3, 4])
    expect(ehConsulta(sqlBruto('select 1'))).toBe(true)
  })

  it('consultar recusa string crua', async () => {
    const exec: Executor = { query: (async () => ({ rows: [] })) as never }
    await expect(consultar(exec, 'select 1' as never)).rejects.toThrow(TypeError)
  })
})

describe('traducao de erros pg', () => {
  it('mapeia unique/fk/check sem vazar detalhe', () => {
    const e = traduzirErroPg({ code: '23505', constraint: 'u_x', detail: 'Key (telefone)=(+55...) already exists' })
    expect(e).toBeInstanceOf(ErroBanco)
    expect(e?.tipo).toBe('unique')
    expect(e?.constraint).toBe('u_x')
    expect(JSON.stringify(e)).not.toContain('+55')
    expect(traduzirErroPg({ code: '23503' })?.tipo).toBe('fk')
    expect(traduzirErroPg({ code: '23514' })?.tipo).toBe('check')
    expect(traduzirErroPg(new Error('x'))).toBeNull()
  })
})

describe('comTransacao', () => {
  function poolFake(log: string[]): Pool {
    const client = {
      query: async (t: string) => {
        log.push(t)
        return { rows: [] }
      },
      release: () => log.push('release'),
    } as unknown as PoolClient
    return { connect: async () => client } as unknown as Pool
  }

  it('commit no sucesso e roda gancho apos begin', async () => {
    const log: string[] = []
    await comTransacao(poolFake(log), async () => 1, {
      aoIniciar: async (c) => {
        await c.query('gancho')
      },
    })
    expect(log).toEqual(['begin', 'gancho', 'commit', 'release'])
  })

  it('rollback garantido em erro', async () => {
    const log: string[] = []
    await expect(
      comTransacao(poolFake(log), async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(log).toEqual(['begin', 'rollback', 'release'])
  })
})
