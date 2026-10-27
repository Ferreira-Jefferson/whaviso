import { describe, expect, it } from 'vitest'
import { ErroConfig, envApiSchema, validarEnv } from './index'

describe('config tipado', () => {
  it('aceita env valido e aplica defaults', () => {
    const env = validarEnv(envApiSchema, {
      DATABASE_URL: 'postgres://u:p@h/db',
      SUPABASE_URL: 'https://x.supabase.co',
      APP_URL: 'http://localhost:5173',
    })
    expect(env.PORT).toBe(3001)
    expect(env.RATE_LIMIT_MAX).toBe(100)
  })

  it('falha listando variaveis ausentes, sem ecoar valores', () => {
    const segredo = 'valor-secreto-que-nao-pode-vazar'
    try {
      validarEnv(envApiSchema, { DATABASE_URL: 'x', SUPABASE_URL: segredo, MASTER_KEY: 'curta' })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ErroConfig)
      const msg = (e as Error).message
      expect(msg).toContain('APP_URL')
      expect(msg).toContain('SUPABASE_URL')
      expect(msg).toContain('MASTER_KEY')
      expect(msg).not.toContain(segredo)
    }
  })
})
