// Apoio dos testes de integracao de salao (nao e codigo de producao): monta a app real com o
// modulo injetado, verificador fake (token = user_id), duas contas isoladas e um cardapio semeado.
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
import { criarSalaoRoutes } from '../routes'

export const online = await bancoAcessivel()

export interface Cardapio {
  burger: string
  suco: string
  inativo: string
}
export interface LojaSemeada {
  loja: string
  cardapio: Cardapio
}

export const logs: string[] = []

export interface Mundo {
  app: Awaited<ReturnType<typeof construirApp>>
  cenario: Cenario
  A: LojaSemeada
  B: LojaSemeada
  dono: string
  gerente: string
  atendente: string
  donoB: string
  operador: string
  /** Caixa aberto da loja A (o fechamento de comanda exige caixa aberto e lanca o recebimento). */
  caixaA: string
}

async function q<T = { id: string }>(sql: string, params: unknown[]): Promise<T> {
  const r = await poolSuper.query(sql, params)
  return r.rows[0] as T
}

async function semear(loja: string): Promise<LojaSemeada> {
  const cat = (await q('insert into public.categorias (loja_id, nome) values ($1,$2) returning id', [loja, 'Lanches'])).id
  const item = async (nome: string, preco: number, ativo = true) =>
    (await q(
      'insert into public.itens (loja_id, categoria_id, nome, preco_centavos, ativo) values ($1,$2,$3,$4,$5) returning id',
      [loja, cat, nome, preco, ativo],
    )).id
  const burger = await item('Burger', 2000)
  const suco = await item('Suco', 800)
  const inativo = await item('Fora de linha', 1000, false)
  return { loja, cardapio: { burger, suco, inativo } }
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
  const operador = await criarUsuario(cenario)
  const contaA = await criarConta(cenario, dono)
  const contaB = await criarConta(cenario, donoB)
  const lojaA = await criarLoja(contaA)
  const lojaB = await criarLoja(contaB)
  await criarMembro(contaA, dono, 'dono', null)
  await criarMembro(contaA, gerente, 'gerente', lojaA)
  await criarMembro(contaA, atendente, 'atendente', lojaA)
  await criarMembro(contaB, donoB, 'dono', null)
  await criarOperador(operador)
  const A = await semear(lojaA)
  const B = await semear(lojaB)
  const destino = new Writable({ write(c: Buffer, _e, cb) { logs.push(c.toString('utf8')); cb() } })
  const app = await construirApp({
    env, pool: poolApi, logger: criarLogger('salao-teste', 'info', destino),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'salao', plugin: criarSalaoRoutes() }],
  })
  await app.ready()
  const caixaA = (await q(
    `insert into public.caixas (loja_id, aberto_por_user_id, saldo_inicial_centavos, status)
     values ($1, $2, 0, 'aberto') returning id`,
    [lojaA, dono],
  )).id
  return { app, cenario, A, B, dono, gerente, atendente, donoB, operador, caixaA }
}

export async function encerrar(m: Mundo): Promise<void> {
  await m.app.close()
  const lojas = [m.A.loja, m.B.loja]
  await poolSuper.query('delete from public.eventos where loja_id = any($1)', [lojas])
  // Trilhas de baixa/caixa referenciam comanda/caixa: apaga antes do teardown compartilhado.
  await poolSuper.query('delete from public.movimentos_item_estoque where loja_id = any($1)', [lojas])
  await poolSuper.query('delete from public.movimentos_insumo where loja_id = any($1)', [lojas])
  await poolSuper.query('delete from public.movimentos_caixa where loja_id = any($1)', [lojas])
  await poolSuper.query('delete from public.caixas where loja_id = any($1)', [lojas])
  await poolSuper.query('delete from public.comanda_itens where loja_id = any($1)', [lojas])
  await poolSuper.query('delete from public.comandas where loja_id = any($1)', [lojas])
  await poolSuper.query('delete from public.mesas where loja_id = any($1)', [lojas])
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
): Promise<{ status: number; corpo: any; headers: Record<string, unknown> }> {
  const res = await m.app.inject({
    method: metodo, url: `/v1/salao${url}`, headers: como(user, loja),
    ...(corpo === undefined ? {} : { payload: corpo as object }),
  })
  return { status: res.statusCode, corpo: res.body ? res.json() : null, headers: res.headers }
}

export const novoId = (): string => randomUUID()
