// F5: a rota esta ligada no construirApp real e e fail-closed sem token (sem tocar no LISTEN).
import { describe, it, expect, afterAll } from 'vitest'
import { construirApp } from '../src/app'
import { envSchema } from '../src/env'
import { verificadorFake } from './app'
import { poolApi, fecharPools } from './db'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '1000',
})

describe('GET /realtime/stream no construirApp', () => {
  afterAll(async () => {
    await fecharPools()
  })

  it('sem token -> 401 no envelope; com token sem vinculo de loja -> 403 (nao abre LISTEN)', async () => {
    const app = await construirApp({ env, pool: poolApi, logger: false, verificador: verificadorFake, modulos: [] })
    const sem = await app.inject({ method: 'GET', url: '/realtime/stream' })
    expect(sem.statusCode).toBe(401)
    expect(sem.json().error.code).toBe('nao_autorizado')
    expect(app.escutaRealtime()).toBeNull()
    await app.close()
  })
})
