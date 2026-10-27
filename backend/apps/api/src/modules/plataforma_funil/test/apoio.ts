// Apoio dos testes de integracao do funil (nao e codigo de producao). Monta a app real
// (construirApp) com o modulo injetado, verificador fake (token = user_id), cifra de teste, dois
// operadores e um membro de loja. Roda no Postgres LOCAL whaviso_dev; se offline, a suite se pula.
import type { InjectOptions } from 'fastify'
import { criarCifra } from '@whaviso/shared/cifra'
import {
  bancoAcessivel,
  criarConta,
  criarLoja,
  criarMembro,
  criarOperador,
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
import { criarPlataformaFunilRoutes } from '../routes'

export const MASTER_KEY = 'master-key-de-teste-funil-0123456789012'
export const cifra = criarCifra(MASTER_KEY)
export { poolSuper, criarConta }

export interface Mundo {
  app: Awaited<ReturnType<typeof construirApp>>
  cenario: Cenario
  /** Operador A (user_id usado como token) e seu id em operadores. */
  opA: string
  opAId: string
  opB: string
  opBId: string
  /** Dono de loja (nao e operador). */
  dono: string
  contaDono: string
  prospectos: string[]
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
  const opA = await criarUsuario(cenario)
  const opB = await criarUsuario(cenario)
  const dono = await criarUsuario(cenario)
  const opAId = await criarOperador(opA)
  const opBId = await criarOperador(opB)
  const contaDono = await criarConta(cenario, dono)
  await criarLoja(contaDono)
  await criarMembro(contaDono, dono, 'dono', null)
  const app = await construirApp({
    env,
    pool: poolApi,
    logger: false,
    verificador: verificadorFake,
    modulos: [{ prefixo: 'plataforma-funil', plugin: criarPlataformaFunilRoutes(cifra) }],
  })
  await app.ready()
  return { app, cenario, opA, opAId, opB, opBId, dono, contaDono, prospectos: [] }
}

export async function encerrar(m: Mundo): Promise<void> {
  await m.app.close()
  // Atividades/eventos/prospectos antes de operadores e contas (FKs); superuser apaga.
  await poolSuper.query('delete from public.prospecto_atividades where prospecto_id = any($1::uuid[])', [m.prospectos])
  await poolSuper.query("delete from public.eventos where entidade = 'prospecto' and entidade_id = any($1::uuid[])", [m.prospectos])
  await poolSuper.query('delete from public.prospectos where id = any($1::uuid[])', [m.prospectos])
  await limpar(m.cenario)
  await fecharPools()
}

/** Atalho de requisicao autenticada; devolve status e corpo ja parseado. */
export async function chamar(
  m: Mundo,
  user: string | null,
  metodo: NonNullable<InjectOptions['method']>,
  url: string,
  corpo?: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- corpo JSON livre nos testes
): Promise<{ status: number; corpo: any; body: string }> {
  const res = await m.app.inject({
    method: metodo,
    url: `/v1/plataforma-funil${url}`,
    headers: user ? { authorization: `Bearer ${user}` } : {},
    ...(corpo === undefined ? {} : { payload: corpo as object }),
  })
  return { status: res.statusCode, corpo: res.body ? res.json() : null, body: res.body }
}

/** Cria prospecto via API e registra o id para limpeza. */
export async function novoProspecto(m: Mundo, user: string, extra: Record<string, unknown> = {}) {
  const r = await chamar(m, user, 'POST', '/prospectos', { nome_restaurante: 'TESTE-FUNIL Restaurante', ...extra })
  if (r.status === 201) m.prospectos.push(r.corpo.id)
  return r
}
