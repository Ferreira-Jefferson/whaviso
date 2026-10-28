// Apoio dos testes de integracao de pessoas (nao e codigo de producao). Monta a app real
// (construirApp) com o modulo injetado, verificador fake (token = user_id), cifra de teste e duas
// contas isoladas. Roda no Postgres LOCAL whaviso_dev; se offline, a suite se pula.
import type { InjectOptions } from 'fastify'
import { criarCifra } from '@whaviso/shared/cifra'
import {
  bancoAcessivel,
  criarConta,
  criarLoja,
  criarMembro,
  criarUsuario,
  fecharPools,
  limpar,
  novoCenario,
  poolApi,
  type Cenario,
} from '../../../../test/db'
import { verificadorFake } from '../../../../test/app'
// Harness de teste: precisa montar a app real (unica excecao a fronteira module -> app-root).
// eslint-disable-next-line boundaries/element-types
import { construirApp } from '../../../app'
// eslint-disable-next-line boundaries/element-types
import { envSchema } from '../../../env'
import { criarPessoasRoutes } from '../routes'

export const MASTER_KEY = 'master-key-de-teste-pessoas-012345678901'
export const cifra = criarCifra(MASTER_KEY)

export interface Mundo {
  app: Awaited<ReturnType<typeof construirApp>>
  cenario: Cenario
  lojaA: string
  lojaB: string
  dono: string
  gerente: string
  atendente: string
  donoB: string
}

export const online = await bancoAcessivel()

export async function montarMundo(): Promise<Mundo> {
  const env = envSchema.parse({
    DATABASE_URL: 'postgres://ignorado',
    SUPABASE_URL: 'https://exemplo.supabase.co',
    APP_URL: 'http://localhost:5173',
    RATE_LIMIT_MAX: '100000',
  })
  const cenario = novoCenario()
  const dono = await criarUsuario(cenario)
  const gerente = await criarUsuario(cenario)
  const atendente = await criarUsuario(cenario)
  const donoB = await criarUsuario(cenario)
  const contaA = await criarConta(cenario, dono)
  const contaB = await criarConta(cenario, donoB)
  const lojaA = await criarLoja(contaA)
  const lojaB = await criarLoja(contaB)
  await criarMembro(contaA, dono, 'dono', null)
  await criarMembro(contaA, gerente, 'gerente', lojaA)
  await criarMembro(contaA, atendente, 'atendente', lojaA)
  await criarMembro(contaB, donoB, 'dono', null)
  const app = await construirApp({
    env,
    pool: poolApi,
    logger: false,
    verificador: verificadorFake,
    modulos: [{ prefixo: 'pessoas', plugin: criarPessoasRoutes(cifra) }],
  })
  await app.ready()
  return { app, cenario, lojaA, lojaB, dono, gerente, atendente, donoB }
}

export async function encerrar(m: Mundo): Promise<void> {
  await m.app.close()
  // pessoas/escalas/cargos da loja cascateiam das lojas (FK on delete cascade) via limpar.
  await limpar(m.cenario)
  await fecharPools()
}

export const como = (user: string, loja: string): Record<string, string> => ({
  authorization: `Bearer ${user}`,
  'x-loja-id': loja,
})

/** Atalho de requisicao autenticada; devolve status e corpo ja parseado. */
export async function chamar(
  m: Mundo,
  user: string,
  loja: string | null,
  metodo: NonNullable<InjectOptions['method']>,
  url: string,
  corpo?: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- corpo JSON livre nos testes
): Promise<{ status: number; corpo: any; body: string; headers: Record<string, unknown> }> {
  const res = await m.app.inject({
    method: metodo,
    url: `/v1/pessoas${url}`,
    headers: { authorization: `Bearer ${user}`, ...(loja ? { 'x-loja-id': loja } : {}) },
    ...(corpo === undefined ? {} : { payload: corpo as object }),
  })
  return { status: res.statusCode, corpo: res.body ? res.json() : null, body: res.body, headers: res.headers }
}
