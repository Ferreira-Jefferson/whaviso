// Harness de teste do modulo conta (so testes importam). Banco isolado, role whaviso_api.
import {
  poolApi,
  poolSuper,
  novoCenario,
  criarUsuario,
  criarConta,
  criarLoja,
  criarMembro,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
// Harness de teste: monta o app de verdade, por isso cruza a fronteira para app-root.
// A regra de fronteira vale para codigo de producao, nao para bootstrap de teste.
/* eslint-disable boundaries/element-types */
import { construirApp } from '../../app'
import { envSchema } from '../../env'
/* eslint-enable boundaries/element-types */
import { contaRoutes } from './routes'

export { poolSuper, novoCenario }

export const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '10000',
})

export async function criarAppConta() {
  const app = await construirApp({
    env,
    pool: poolApi,
    logger: false,
    verificador: verificadorFake,
    modulos: [{ prefixo: 'conta', plugin: contaRoutes }],
  })
  await app.ready()
  return app
}

export type Cenario = ReturnType<typeof novoCenario>

export type App = Awaited<ReturnType<typeof criarAppConta>>

let seq = 0

/** Cada chamada sai de um IP distinto (X-Forwarded-For, proxy loopback confiavel), exceto se `ip` for dado. */
export function criarChamador(app: App) {
  return (
    user: string | null,
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    payload?: object,
    ip?: string,
  ) =>
    app.inject({
      method,
      url: `/v1/conta${url}`,
      headers: {
        'x-forwarded-for': ip ?? `10.${(seq >> 8) & 255}.${seq++ & 255}.1`,
        ...(user ? { authorization: `Bearer ${user}` } : {}),
      },
      ...(payload ? { payload } : {}),
    })
}

export const tokenDoLink = (link: string): string => link.split('/convite/')[1]!

/** Conta com dono (todas as lojas), loja A e loja B. */
export async function montar(c: Cenario) {
  const dono = await criarUsuario(c)
  const contaId = await criarConta(c, dono)
  const donoMembro = await criarMembro(contaId, dono, 'dono', null)
  const lojaA = await criarLoja(contaId)
  const lojaB = await criarLoja(contaId)
  return { dono, contaId, donoMembro, lojaA, lojaB }
}

export { criarUsuario, criarMembro }
