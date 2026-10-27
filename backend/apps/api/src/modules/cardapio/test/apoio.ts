// Apoio dos testes de integracao do cardapio (nao e codigo de producao). Monta a app real
// (construirApp) com o modulo injetado, verificador fake (token = user_id) e duas contas isoladas.
import type { InjectOptions } from 'fastify'
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
  poolSuper,
  type Cenario,
} from '../../../../test/db'
import { verificadorFake } from '../../../../test/app'
// Harness de teste: precisa montar a app real (unica excecao a fronteira module -> app-root).
// eslint-disable-next-line boundaries/element-types
import { construirApp } from '../../../app'
// eslint-disable-next-line boundaries/element-types
import { envSchema } from '../../../env'
import { cardapioRoutes } from '../routes'

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
    modulos: [{ prefixo: 'cardapio', plugin: cardapioRoutes }],
  })
  await app.ready()
  return { app, cenario, lojaA, lojaB, dono, gerente, atendente, donoB }
}

export async function encerrar(m: Mundo): Promise<void> {
  await m.app.close()
  // eventos (auditoria) referencia lojas sem cascata: limpa antes de remover as contas.
  await poolSuper.query('delete from public.eventos where loja_id = any($1)', [[m.lojaA, m.lojaB]])
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
  loja: string,
  metodo: NonNullable<InjectOptions['method']>,
  url: string,
  corpo?: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- corpo JSON livre nos testes
): Promise<{ status: number; corpo: any }> {
  const res = await m.app.inject({
    method: metodo,
    url: `/v1/cardapio${url}`,
    headers: como(user, loja),
    ...(corpo === undefined ? {} : { payload: corpo as object }),
  })
  return { status: res.statusCode, corpo: res.body ? res.json() : null }
}
