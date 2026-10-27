// Apoio dos testes de integracao de plataforma_clientes (nao e codigo de producao): monta a app
// real com o modulo injetado, verificador fake (token = user_id), duas contas com nome unico
// (isola a busca de outros testes), um operador, um admin e um membro de loja.
import { Writable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import type { InjectOptions } from 'fastify'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarOperador, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper, type Cenario,
} from '../../../../test/db'
import { verificadorFake } from '../../../../test/app'
import { construirApp } from '../../../app'
import { envSchema } from '../../../env'
import { criarPlataformaClientesRoutes } from '../routes'

export const online = await bancoAcessivel()
export const logs: string[] = []

export interface Mundo {
  app: Awaited<ReturnType<typeof construirApp>>
  cenario: Cenario
  /** marca unica nos nomes das contas deste mundo (busca isolada) */
  marca: string
  contaA: string
  contaB: string
  contaC: string
  lojaA: string
  dono: string
  donoB: string
  gerente: string
  operador: string
  admin: string
  adminOpId: string
  operadorOpId: string
}

export async function montarMundo(): Promise<Mundo> {
  const env = envSchema.parse({
    DATABASE_URL: 'postgres://ignorado',
    SUPABASE_URL: 'https://exemplo.supabase.co',
    APP_URL: 'http://localhost:5173',
    RATE_LIMIT_MAX: '100000',
  })
  const marca = `PC${randomUUID().slice(0, 8)}`
  const cenario = novoCenario()
  const dono = await criarUsuario(cenario)
  const donoB = await criarUsuario(cenario)
  const donoC = await criarUsuario(cenario)
  const gerente = await criarUsuario(cenario)
  const operador = await criarUsuario(cenario)
  const admin = await criarUsuario(cenario)
  const contaA = await criarConta(cenario, dono)
  const contaB = await criarConta(cenario, donoB)
  const contaC = await criarConta(cenario, donoC)
  await poolSuper.query('update public.contas set nome = $2 where id = $1', [contaA, `${marca} Alfa`])
  await poolSuper.query('update public.contas set nome = $2 where id = $1', [contaB, `${marca} Beta`])
  await poolSuper.query('update public.contas set nome = $2 where id = $1', [contaC, `${marca} Gama`])
  const lojaA = await criarLoja(contaA)
  await criarLoja(contaB)
  await criarMembro(contaA, dono, 'dono', null)
  await criarMembro(contaA, gerente, 'gerente', lojaA)
  await criarMembro(contaB, donoB, 'dono', null)
  const operadorOpId = await criarOperador(operador, 'operador')
  const adminOpId = await criarOperador(admin, 'admin')
  const destino = new Writable({ write(c: Buffer, _e, cb) { logs.push(c.toString('utf8')); cb() } })
  const app = await construirApp({
    env, pool: poolApi, logger: criarLogger('plataforma-clientes-teste', 'info', destino),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'plataforma-clientes', plugin: criarPlataformaClientesRoutes() }],
  })
  await app.ready()
  return {
    app, cenario, marca, contaA, contaB, contaC, lojaA, dono, donoB, gerente, operador, admin,
    adminOpId, operadorOpId,
  }
}

export async function encerrar(m: Mundo): Promise<void> {
  await m.app.close()
  const contas = [m.contaA, m.contaB, m.contaC]
  await poolSuper.query('delete from public.assinaturas where conta_id = any($1)', [contas])
  await poolSuper.query(
    "delete from public.eventos where entidade = 'operador' and detalhes->>'por_user_id' = any($1)",
    [[m.admin, m.operador]],
  )
  await limpar(m.cenario)
  await fecharPools()
}

export const como = (user?: string): Record<string, string> =>
  user ? { authorization: `Bearer ${user}` } : {}

export async function chamar(
  m: Mundo, user: string | undefined, metodo: NonNullable<InjectOptions['method']>, url: string, corpo?: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- corpo JSON livre nos testes
): Promise<{ status: number; corpo: any; headers: Record<string, unknown> }> {
  const res = await m.app.inject({
    method: metodo, url: `/v1/plataforma-clientes${url}`, headers: como(user),
    ...(corpo === undefined ? {} : { payload: corpo as object }),
  })
  return { status: res.statusCode, corpo: res.body ? res.json() : null, headers: res.headers }
}
