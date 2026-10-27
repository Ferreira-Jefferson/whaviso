// Apoio dos testes de integracao de pedidos (nao e codigo de producao): monta a app real com o
// modulo injetado, verificador fake (token = user_id), duas contas isoladas e um cardapio semeado.
import { Writable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import type { InjectOptions } from 'fastify'
import { criarCifra } from '@whaviso/shared/cifra'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarOperador, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper, type Cenario,
} from '../../../../test/db'
import { verificadorFake } from '../../../../test/app'
// Harness de teste (pasta tests/ fica fora da regra de fronteira): monta a app real.
import { construirApp } from '../../../app'
import { envSchema } from '../../../env'
import { criarPedidosRoutes } from '../routes'

export const online = await bancoAcessivel()
export const TELEFONE = '+5511999991234'
export const NOME_CLIENTE = 'Cliente Sigiloso'
export const LOGRADOURO = 'Rua Secreta Unica'
const cifra = criarCifra('master-key-de-teste-pedidos-0123456789')

export interface Cardapio {
  burger: string
  suco: string
  pequena: string
  grande: string
  bacon: string
  ovo: string
  queijo: string
  grupoTamanho: string
}
export interface LojaSemeada {
  loja: string
  cliente: string
  endereco: string
  cardapio: Cardapio
}

export const logs: string[] = []

export interface Mundo {
  app: Awaited<ReturnType<typeof construirApp>>
  cenario: Cenario
  A: LojaSemeada
  B: LojaSemeada
  dono: string
  atendente: string
  donoB: string
  operador: string
}

async function q<T = { id: string }>(sql: string, params: unknown[]): Promise<T> {
  const r = await poolSuper.query(sql, params)
  return r.rows[0] as T
}

async function semear(loja: string): Promise<LojaSemeada> {
  const cat = (await q('insert into public.categorias (loja_id, nome) values ($1, $2) returning id', [loja, 'Lanches'])).id
  const gt = (await q(
    `insert into public.grupos_opcoes (loja_id, nome, tipo, obrigatorio, min_escolhas, max_escolhas, ordem)
     values ($1, 'Tamanho', 'tamanho', true, 1, 1, 0) returning id`, [loja])).id
  const op = async (g: string, nome: string, preco: number) =>
    (await q('insert into public.opcoes (loja_id, grupo_id, nome, preco_centavos) values ($1,$2,$3,$4) returning id', [loja, g, nome, preco])).id
  const pequena = await op(gt, 'Pequena', 0)
  const grande = await op(gt, 'Grande', 500)
  const ga = (await q(
    `insert into public.grupos_opcoes (loja_id, nome, tipo, obrigatorio, min_escolhas, max_escolhas, aplica_a_opcao_id, ordem)
     values ($1, 'Adicionais', 'adicional', false, 0, 2, $2, 1) returning id`, [loja, grande])).id
  const bacon = await op(ga, 'Bacon', 300)
  const ovo = await op(ga, 'Ovo', 200)
  const queijo = await op(ga, 'Queijo', 250)
  await poolSuper.query('insert into public.categoria_grupos (categoria_id, grupo_id, loja_id, ordem) values ($1,$2,$3,0),($1,$4,$3,1)', [cat, gt, loja, ga])
  const burger = (await q('insert into public.itens (loja_id, categoria_id, nome, preco_centavos) values ($1,$2,$3,$4) returning id', [loja, cat, 'Burger', 2000])).id
  const suco = (await q('insert into public.itens (loja_id, categoria_id, nome, preco_centavos) values ($1,$2,$3,$4) returning id', [loja, cat, 'Suco', 800])).id
  await poolSuper.query('insert into public.item_grupos (item_id, grupo_id, loja_id, incluir) values ($1,$2,$3,false),($1,$4,$3,false)', [suco, gt, loja, ga])
  const cliente = (await q(
    'insert into public.clientes (loja_id, telefone_hash, telefone_cifrado, nome) values ($1,$2,$3,$4) returning id',
    [loja, cifra.hashTelefone(TELEFONE), cifra.cifrar(Buffer.from(TELEFONE)), NOME_CLIENTE])).id
  const endereco = (await q(
    'insert into public.enderecos (loja_id, cliente_id, logradouro, numero, bairro) values ($1,$2,$3,$4,$5) returning id',
    [loja, cliente, LOGRADOURO, '10', 'Centro'])).id
  return { loja, cliente, endereco, cardapio: { burger, suco, pequena, grande, bacon, ovo, queijo, grupoTamanho: gt } }
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
  const atendente = await criarUsuario(cenario)
  const donoB = await criarUsuario(cenario)
  const operador = await criarUsuario(cenario)
  const contaA = await criarConta(cenario, dono)
  const contaB = await criarConta(cenario, donoB)
  const lojaA = await criarLoja(contaA)
  const lojaB = await criarLoja(contaB)
  await criarMembro(contaA, dono, 'dono', null)
  await criarMembro(contaA, atendente, 'atendente', lojaA)
  await criarMembro(contaB, donoB, 'dono', null)
  await criarOperador(operador)
  const A = await semear(lojaA)
  const B = await semear(lojaB)
  const destino = new Writable({ write(c: Buffer, _e, cb) { logs.push(c.toString('utf8')); cb() } })
  const app = await construirApp({
    env, pool: poolApi, logger: criarLogger('pedidos-teste', 'info', destino),
    verificador: verificadorFake,
    modulos: [{ prefixo: 'pedidos', plugin: criarPedidosRoutes(cifra) }],
  })
  await app.ready()
  return { app, cenario, A, B, dono, atendente, donoB, operador }
}

export async function encerrar(m: Mundo): Promise<void> {
  await m.app.close()
  const lojas = [m.A.loja, m.B.loja]
  await poolSuper.query('delete from public.eventos where loja_id = any($1)', [lojas])
  await poolSuper.query('delete from public.pedidos where loja_id = any($1)', [lojas])
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
    method: metodo, url: `/v1/pedidos${url}`, headers: como(user, loja),
    ...(corpo === undefined ? {} : { payload: corpo as object }),
  })
  return { status: res.statusCode, corpo: res.body ? res.json() : null, headers: res.headers }
}

/** Corpo valido de criacao manual: 1 Burger Grande + Bacon, entrega, taxa 500. */
export function corpoPadrao(s: LojaSemeada, extra: Record<string, unknown> = {}) {
  return {
    cliente_id: s.cliente, modalidade: 'entrega', endereco_id: s.endereco, taxa_entrega_centavos: 500,
    itens: [{ item_id: s.cardapio.burger, quantidade: 2, opcoes_ids: [s.cardapio.grande, s.cardapio.bacon] }],
    ...extra,
  }
}
export const novoId = (): string => randomUUID()
