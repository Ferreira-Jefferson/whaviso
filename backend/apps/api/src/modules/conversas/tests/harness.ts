// Harness de integracao do modulo: app com o modulo injetado, escuta do NOTIFY e limpeza.
import { afterAll, afterEach, beforeAll } from 'vitest'
import type { PoolClient } from '@whaviso/shared/db'
import { criarLogger } from '@whaviso/shared/logger'
import { construirApp } from '../../../app'
import { envSchema } from '../../../env'
import { verificadorFake } from '../../../../test/app'
import { fecharPools, poolApi, poolSuper, novoCenario, limpar, type Cenario } from '../../../../test/db'
import { criarConversasRoutes } from '../routes'
import { criarMundo, type Mundo } from './fixtures'

export const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '1000',
})

export const horas = (h: number) => h * 60 * 60 * 1000

export const bearer = (u: string, loja?: string): Record<string, string> => ({
  authorization: `Bearer ${u}`,
  ...(loja ? { 'x-loja-id': loja } : {}),
})

export interface EventoCapturado {
  tipo: string
  loja_id: string
  payload: Record<string, unknown>
}

export function criarHarness() {
  let escuta: PoolClient
  const h = {
    app: undefined as unknown as Awaited<ReturnType<typeof construirApp>>,
    cenario: novoCenario() as Cenario,
    relogio: (() => new Date()) as () => Date,
    eventos: [] as EventoCapturado[],
    async montar(opts: { respostasPorMinuto?: number; logger?: ReturnType<typeof criarLogger> } = {}) {
      h.app = await construirApp({
        env,
        pool: poolApi,
        logger: opts.logger ?? false,
        verificador: verificadorFake,
        modulos: [
          {
            prefixo: 'conversas',
            plugin: criarConversasRoutes({ relogio: () => h.relogio(), respostasPorMinuto: opts.respostasPorMinuto }),
          },
        ],
      })
    },
    async novo(papel: 'dono' | 'gerente' | 'atendente' = 'dono'): Promise<Mundo> {
      h.cenario = novoCenario()
      h.eventos = []
      return criarMundo(h.cenario, papel)
    },
    async esperar(fn: () => boolean) {
      for (let i = 0; i < 40 && !fn(); i++) await new Promise((r) => setTimeout(r, 25))
    },
  }
  beforeAll(async () => {
    escuta = await poolSuper.connect()
    await escuta.query('listen whaviso_eventos')
    escuta.on('notification', (n) => {
      if (n.payload) h.eventos.push(JSON.parse(n.payload))
    })
  })
  afterEach(async () => {
    h.relogio = () => new Date()
    if (h.app) await h.app.close()
    await limpar(h.cenario)
  })
  afterAll(async () => {
    escuta.release()
    await fecharPools()
  })
  return h
}
