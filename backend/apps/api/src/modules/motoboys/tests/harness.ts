// Apoio dos testes de integracao de motoboys (nao e codigo de producao): app real com o modulo
// injetado, verificador fake (token = user_id), cifra de teste, duas contas isoladas, e semeadura
// de pessoa de cargo motoboy, zona e pedidos entregues direto no banco (poolSuper).
import { Writable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import type { InjectOptions } from 'fastify'
import { criarCifra } from '@whaviso/shared/cifra'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper, type Cenario,
} from '../../../../test/db'
import { verificadorFake } from '../../../../test/app'
import { construirApp } from '../../../app'
import { envSchema } from '../../../env'
import { criarMotoboysRoutes } from '../routes'

export const MASTER_KEY = 'master-key-de-teste-motoboys-0123456789'
export const cifra = criarCifra(MASTER_KEY)
export const online = await bancoAcessivel()
export const logs: string[] = []

export interface LojaSemeada {
  loja: string
  /** Pessoa de cargo motoboy (com telefone cifrado). */
  pessoaMotoboy: string
  /** Pessoa de outro cargo (nao motoboy). */
  pessoaOutra: string
  zona: string
}

export interface Mundo {
  app: Awaited<ReturnType<typeof construirApp>>
  cenario: Cenario
  A: LojaSemeada
  B: LojaSemeada
  dono: string
  gerente: string
  atendente: string
  donoB: string
}

export const TELEFONE_CLARO = '+5511987654321'
export const PIX_CPF = '52998224725'

async function q<T = { id: string }>(sql: string, params: unknown[]): Promise<T> {
  const r = await poolSuper.query(sql, params)
  return r.rows[0] as T
}

async function semear(loja: string): Promise<LojaSemeada> {
  const cargoMotoboy = (await q("select id from public.cargos where chave = 'motoboy' and loja_id is null", [])).id
  const cargoOutro = (await q("select id from public.cargos where chave is distinct from 'motoboy' and loja_id is null and ativo limit 1", [])).id
  const pessoa = async (nome: string, cargo: string, tel: Buffer | null) =>
    (await q(
      'insert into public.pessoas (loja_id, nome, cargo_id, telefone_cifrado) values ($1,$2,$3,$4) returning id',
      [loja, nome, cargo, tel],
    )).id
  const pessoaMotoboy = await pessoa('Joao Entregador', cargoMotoboy, cifra.cifrar(Buffer.from(TELEFONE_CLARO)))
  const pessoaOutra = await pessoa('Maria Cozinha', cargoOutro, null)
  const zona = (await q(
    `insert into public.zonas_entrega (loja_id, nome, tipo, bairro, taxa_cliente_centavos, valor_motoboy_centavos)
     values ($1,'Centro','bairro','Centro',500,700) returning id`,
    [loja],
  )).id
  return { loja, pessoaMotoboy, pessoaOutra, zona }
}

/** Pedido entregue (status entregue) numa data/hora UTC, com motoboy e zona opcionais. */
export async function semearPedidoEntregue(
  loja: string,
  o: { motoboyId: string | null; zonaId: string | null; entregueEmUtc: string; status?: string },
): Promise<string> {
  const codigo = `T${randomUUID().slice(0, 8)}`
  return (await q(
    `insert into public.pedidos (loja_id, codigo, status, modalidade, subtotal_centavos, total_centavos,
                                 motoboy_id, zona_id, entregue_em)
     values ($1,$2,$3::status_pedido,'entrega',2000,2000,$4,$5,$6) returning id`,
    [loja, codigo, o.status ?? 'entregue', o.motoboyId, o.zonaId, o.entregueEmUtc],
  )).id
}

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
  const A = await semear(lojaA)
  const B = await semear(lojaB)
  const destino = new Writable({ write(c: Buffer, _e, cb) { logs.push(c.toString('utf8')); cb() } })
  const app = await construirApp({
    env, pool: poolApi, logger: criarLogger('motoboys-teste', 'info', destino),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'motoboys', plugin: criarMotoboysRoutes(cifra) }],
  })
  await app.ready()
  return { app, cenario, A, B, dono, gerente, atendente, donoB }
}

export async function encerrar(m: Mundo): Promise<void> {
  await m.app.close()
  const lojas = [m.A.loja, m.B.loja]
  // eventos nao cascateia das lojas; o resto (motoboys, fechamentos, lancamentos, pedidos, pessoas) sim.
  await poolSuper.query('delete from public.eventos where loja_id = any($1)', [lojas])
  await limpar(m.cenario)
  await fecharPools()
}

export const como = (user: string, loja: string): Record<string, string> => ({
  authorization: `Bearer ${user}`,
  'x-loja-id': loja,
})

export async function chamar(
  m: Mundo, user: string, loja: string, metodo: NonNullable<InjectOptions['method']>, url: string, corpo?: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- corpo JSON livre nos testes
): Promise<{ status: number; corpo: any; body: string; headers: Record<string, unknown> }> {
  const res = await m.app.inject({
    method: metodo, url: `/v1/motoboys${url}`, headers: como(user, loja),
    ...(corpo === undefined ? {} : { payload: corpo as object }),
  })
  return { status: res.statusCode, corpo: res.body ? res.json() : null, body: res.body, headers: res.headers }
}
