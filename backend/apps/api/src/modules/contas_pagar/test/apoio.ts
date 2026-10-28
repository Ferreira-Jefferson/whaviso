// Apoio dos testes de integracao de contas a pagar (nao e codigo de producao): app real com o modulo
// injetado, verificador fake (token = user_id), cifra de teste e duas contas isoladas. Semeia uma
// pessoa por loja (credor tipo pessoa) direto no banco (poolSuper). Roda no Postgres LOCAL
// whaviso_dev; se offline, a suite se pula.
import { randomUUID } from 'node:crypto'
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
  poolSuper,
  type Cenario,
} from '../../../../test/db'
import { verificadorFake } from '../../../../test/app'
// Harness de teste: precisa montar a app real (unica excecao a fronteira module -> app-root).
// eslint-disable-next-line boundaries/element-types
import { construirApp } from '../../../app'
// eslint-disable-next-line boundaries/element-types
import { envSchema } from '../../../env'
import { criarContasPagarRoutes } from '../routes'

export const MASTER_KEY = 'master-key-de-teste-contas-pagar-0123456789'
export const cifra = criarCifra(MASTER_KEY)

export const online = await bancoAcessivel()

export interface LojaSemeada {
  loja: string
  /** Pessoa (credor tipo pessoa). */
  pessoa: string
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

async function semearPessoa(loja: string, nome: string): Promise<string> {
  const cargo = (
    await poolSuper.query<{ id: string }>(
      "select id from public.cargos where loja_id is null and ativo order by sistema desc limit 1",
    )
  ).rows[0]!.id
  const r = await poolSuper.query<{ id: string }>(
    'insert into public.pessoas (loja_id, nome, cargo_id) values ($1,$2,$3) returning id',
    [loja, nome, cargo],
  )
  return r.rows[0]!.id
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
  const A: LojaSemeada = { loja: lojaA, pessoa: await semearPessoa(lojaA, 'Prestador A') }
  const B: LojaSemeada = { loja: lojaB, pessoa: await semearPessoa(lojaB, 'Prestador B') }
  const app = await construirApp({
    env,
    pool: poolApi,
    logger: false,
    verificador: verificadorFake,
    modulos: [{ prefixo: 'contas-pagar', plugin: criarContasPagarRoutes(cifra) }],
  })
  await app.ready()
  return { app, cenario, A, B, dono, gerente, atendente, donoB }
}

export async function encerrar(m: Mundo): Promise<void> {
  await m.app.close()
  // eventos nao cascateia das lojas; o resto (motoboys/lancamentos/acertos/pedidos/fornecedores/
  // contas_pagar/pessoas) cascateia das lojas.
  await poolSuper.query('delete from public.eventos where loja_id = any($1)', [[m.A.loja, m.B.loja]])
  await limpar(m.cenario)
  await fecharPools()
}

/** Zona de entrega com o valor do motoboy informado (centavos). */
export async function semearZona(loja: string, valorMotoboyCentavos: number): Promise<string> {
  const r = await poolSuper.query<{ id: string }>(
    `insert into public.zonas_entrega (loja_id, nome, tipo, bairro, taxa_cliente_centavos, valor_motoboy_centavos)
     values ($1,'Centro','bairro','Centro',500,$2) returning id`,
    [loja, valorMotoboyCentavos],
  )
  return r.rows[0]!.id
}

/** Pessoa de cargo motoboy + cadastro de motoboy com o regime informado. Devolve o motoboy_id. */
export async function semearMotoboy(
  loja: string,
  nome: string,
  regime: { regime: 'por_entrega' | 'fixo' | 'fixo_mais_entrega'; periodicidade?: 'dia' | 'mes'; valorFixo?: number },
): Promise<string> {
  const cargo = (
    await poolSuper.query<{ id: string }>(
      "select id from public.cargos where chave = 'motoboy' and loja_id is null",
    )
  ).rows[0]!.id
  const pessoa = (
    await poolSuper.query<{ id: string }>(
      'insert into public.pessoas (loja_id, nome, cargo_id) values ($1,$2,$3) returning id',
      [loja, nome, cargo],
    )
  ).rows[0]!.id
  const r = await poolSuper.query<{ id: string }>(
    `insert into public.motoboys (loja_id, pessoa_id, nome, regime_pagamento, periodicidade_fixo, valor_fixo_centavos)
     values ($1,$2,$3,$4::regime_pagamento,$5::periodicidade_fixo,$6) returning id`,
    [loja, pessoa, nome, regime.regime, regime.periodicidade ?? 'dia', regime.valorFixo ?? 0],
  )
  return r.rows[0]!.id
}

/** Pedido entregue (status entregue) numa data/hora UTC, com motoboy e zona opcionais. */
export async function semearPedidoEntregue(
  loja: string,
  o: { motoboyId: string | null; zonaId: string | null; entregueEmUtc: string; status?: string },
): Promise<string> {
  const codigo = `T${randomUUID().slice(0, 8)}`
  const r = await poolSuper.query<{ id: string }>(
    `insert into public.pedidos (loja_id, codigo, status, modalidade, subtotal_centavos, total_centavos,
                                 motoboy_id, zona_id, entregue_em)
     values ($1,$2,$3::status_pedido,'entrega',2000,2000,$4,$5,$6) returning id`,
    [loja, codigo, o.status ?? 'entregue', o.motoboyId, o.zonaId, o.entregueEmUtc],
  )
  return r.rows[0]!.id
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
    url: `/v1/contas-pagar${url}`,
    headers: { authorization: `Bearer ${user}`, ...(loja ? { 'x-loja-id': loja } : {}) },
    ...(corpo === undefined ? {} : { payload: corpo as object }),
  })
  return { status: res.statusCode, corpo: res.body ? res.json() : null, body: res.body, headers: res.headers }
}
