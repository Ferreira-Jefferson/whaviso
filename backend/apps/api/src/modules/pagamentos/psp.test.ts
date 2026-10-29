// Pagamento intermediado (PSP) + webhook. Integracao no Postgres LOCAL (whaviso_dev por worker).
// Exercita o fluxo completo com um ClientePagamento FAKE injetado (o Asaas real e TODO), e cobre:
// credencial cifrada (segredo), subconta, cobranca intermediada (absorve/repassa), conciliacao por
// webhook (assinatura + idempotencia) e o 501 quando o PSP nao esta integrado.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createHmac, randomUUID } from 'node:crypto'
import { invalidarCacheTaxas } from '@whaviso/shared/taxas'
import { criarPool, criarPoolSuper, bancoDoWorker, HOST } from '../../../../../test-support/banco'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { verificadorFake } from '../../../test/app'
import { criarCripto } from './cripto'
import { criarRotasPagamentos } from './routes'
import type { ClientePagamento, CredencialPsp, EventoWebhookPsp, ParamsCobrancaPsp } from './psp_cliente'

const poolApi = criarPool('whaviso_api', 'whaviso_api_dev', 3)
const poolSuper = criarPoolSuper(3)

async function bancoAcessivel(): Promise<boolean> {
  try {
    await poolApi.query('select 1')
    const { rows } = await poolSuper.query(
      "select 1 from information_schema.tables where table_schema='public' and table_name='loja_pagamento_config'",
    )
    return rows.length === 1
  } catch {
    return false
  }
}

const MASTER_KEY = 'master-key-de-teste-psp-integracao-0123456789abcdef'
const cripto = criarCripto(MASTER_KEY)

const env = envSchema.parse({
  DATABASE_URL: `postgresql://whaviso_api:whaviso_api_dev@${HOST}:5432/${bancoDoWorker()}`,
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  MASTER_KEY,
  RATE_LIMIT_DESLIGADO: 'true',
})

/** Cliente de PSP FAKE: cobranca deterministica + webhook assinado por HMAC do corpo com o segredo. */
class FakeClientePagamento implements ClientePagamento {
  ultimo: ParamsCobrancaPsp | null = null
  async criarCobranca(_cred: CredencialPsp, p: ParamsCobrancaPsp) {
    this.ultimo = p
    return { chargeRef: 'chg_' + randomUUID().slice(0, 12), payload: 'PIX-DIN-' + p.referencia }
  }
  interpretarWebhook(segredo: string, assinatura: string | undefined, corpoBruto: string): EventoWebhookPsp | null {
    const esperado = createHmac('sha256', segredo).update(corpoBruto).digest('hex')
    if (!assinatura || assinatura !== esperado) return null
    const ev = JSON.parse(corpoBruto) as { charge_ref: string; pago: boolean; taxa_psp?: number }
    return { chargeRef: ev.charge_ref, pago: ev.pago, taxaPspCentavos: ev.taxa_psp ?? null }
  }
}

async function montarApp(clientePsp: ClientePagamento | null) {
  return construirApp({
    env,
    pool: poolApi,
    logger: false,
    verificador: verificadorFake,
    modulos: [{ prefixo: 'pagamentos', plugin: criarRotasPagamentos({ cripto, clientePsp }) }],
  })
}

// ---- fixtures ------------------------------------------------------------------------------
const usuarios: string[] = []
const contas: string[] = []

async function criarUsuario(): Promise<string> {
  const id = randomUUID()
  await poolSuper.query('insert into auth.users (id) values ($1)', [id])
  usuarios.push(id)
  return id
}
async function criarOperadorAdmin(): Promise<string> {
  const userId = await criarUsuario()
  await poolSuper.query(
    "insert into public.operadores (user_id, nome, papel, ativo) values ($1,$2,'admin',true)",
    [userId, 'Admin Teste'],
  )
  return userId
}
async function criarContaLojaMembro(papel: 'dono' | 'gerente' | 'atendente') {
  const userId = await criarUsuario()
  const contaId = randomUUID()
  await poolSuper.query('insert into public.contas (id, dono_user_id, nome) values ($1,$2,$3)', [contaId, userId, 'Conta PSP'])
  contas.push(contaId)
  const lojaId = randomUUID()
  await poolSuper.query('insert into public.lojas (id, conta_id, nome, ativo) values ($1,$2,$3,true)', [lojaId, contaId, 'Loja PSP'])
  await poolSuper.query(
    'insert into public.membros (conta_id, loja_id, user_id, papel, ativo) values ($1,$2,$3,$4,true)',
    [contaId, lojaId, userId, papel],
  )
  return { userId, contaId, lojaId }
}
async function criarPedido(lojaId: string, total: number, status = 'novo'): Promise<string> {
  const id = randomUUID()
  await poolSuper.query(
    `insert into public.pedidos (id, loja_id, codigo, status, subtotal_centavos, taxa_entrega_centavos, total_centavos)
     values ($1,$2,$3,$5,$4,0,$4)`,
    [id, lojaId, 'P' + id.slice(0, 6).toUpperCase(), total, status],
  )
  return id
}
const authLoja = (userId: string, lojaId: string) => ({ authorization: `Bearer ${userId}`, 'x-loja-id': lojaId })
const authOp = (userId: string) => ({ authorization: `Bearer ${userId}` })

let disponivel = false
beforeAll(async () => {
  disponivel = await bancoAcessivel()
  if (!disponivel) console.warn('[psp] banco/tabela indisponivel: testes pulados')
  // padrao de taxa deterministico para este worker (e cache limpo) antes das cobrancas.
  if (disponivel) await poolSuper.query('update public.config_plataforma set taxa_intermediacao_padrao_centavos = 50 where id = 1')
})
afterEach(async () => {
  for (const c of contas.splice(0)) await poolSuper.query('delete from public.contas where id=$1', [c]).catch(() => {})
  for (const u of usuarios.splice(0)) await poolSuper.query('delete from auth.users where id=$1', [u]).catch(() => {})
  await poolSuper.query("delete from public.credenciais_psp where provider='asaas'").catch(() => {})
})
afterAll(async () => {
  await poolApi.end().catch(() => {})
  await poolSuper.end().catch(() => {})
})

describe('PSP: credencial (operador)', () => {
  it('operador define e le o status; a chave nunca volta nem fica em claro no banco (SEC-020/023)', async () => {
    if (!disponivel) return
    const op = await criarOperadorAdmin()
    const app = await montarApp(new FakeClientePagamento())
    const chave = 'asaas-api-key-SECRETA-0123456789'
    const put = await app.inject({ method: 'PUT', url: '/v1/pagamentos/psp/credencial', headers: authOp(op), payload: { chave } })
    expect(put.statusCode, put.body).toBe(200)
    expect(put.json()).toMatchObject({ configurada: true })
    expect(put.body).not.toContain(chave)

    const get = await app.inject({ method: 'GET', url: '/v1/pagamentos/psp/credencial', headers: authOp(op) })
    await app.close()
    expect(get.json()).toMatchObject({ configurada: true })
    expect(get.body).not.toContain(chave)

    const { rows } = await poolApi.query('select chave_cifrada from public.credenciais_psp where provider=$1', ['asaas'])
    const cifrada = rows[0].chave_cifrada as Buffer
    expect(cripto.decifrar(cifrada)).toBe(chave)
    expect(cifrada.toString('utf8')).not.toContain(chave)
  })

  it('membro de loja NAO acessa a credencial do PSP (403, acesso plataforma)', async () => {
    if (!disponivel) return
    const { userId, lojaId } = await criarContaLojaMembro('dono')
    const app = await montarApp(new FakeClientePagamento())
    const res = await app.inject({ method: 'PUT', url: '/v1/pagamentos/psp/credencial', headers: authLoja(userId, lojaId), payload: { chave: 'x' } })
    await app.close()
    expect(res.statusCode).toBe(403)
  })
})

describe('PSP: cobranca intermediada e webhook', () => {
  async function prepararLojaIntermediada(encargo: 'absorve' | 'repassa') {
    const op = await criarOperadorAdmin()
    const { userId, contaId, lojaId } = await criarContaLojaMembro('dono')
    const app = await montarApp(new FakeClientePagamento())
    // credencial do PSP (operador)
    await app.inject({ method: 'PUT', url: '/v1/pagamentos/psp/credencial', headers: authOp(op), payload: { chave: 'asaas-key-xyz' } })
    // config: Pix intermediado + encargo escolhido (loja)
    await app.inject({ method: 'PUT', url: '/v1/pagamentos/config', headers: authLoja(userId, lojaId), payload: { pix_modo: 'intermediado', encargo_modo: encargo } })
    // subconta aprovada (no mundo real vem do PSP; aqui aprovamos direto no banco)
    await poolSuper.query(
      "insert into public.psp_subcontas (loja_id, provider, subconta_ref, status_kyc) values ($1,'asaas','rcv_1','aprovada')",
      [lojaId],
    )
    invalidarCacheTaxas()
    return { app, userId, contaId, lojaId }
  }

  it('absorve: cliente paga o total; encargo = taxa; cobranca fica provider=asaas e pendente', async () => {
    if (!disponivel) return
    const { app, userId, lojaId } = await prepararLojaIntermediada('absorve')
    const pedido = await criarPedido(lojaId, 6000)
    const res = await app.inject({ method: 'POST', url: `/v1/pagamentos/pedidos/${pedido}/intermediado`, headers: authLoja(userId, lojaId), payload: { meio: 'pix' } })
    expect(res.statusCode, res.body).toBe(201)
    const pag = res.json()
    expect(pag).toMatchObject({ status: 'pendente', valor_centavos: 6000 })
    expect(pag.br_code).toContain('PIX-DIN-')
    const { rows } = await poolApi.query('select provider, meio, encargo_centavos, charge_ref from public.pagamentos where id=$1', [pag.id])
    await app.close()
    expect(rows[0]).toMatchObject({ provider: 'asaas', meio: 'pix', encargo_centavos: 50 })
    expect(rows[0].charge_ref).toBeTruthy()
  })

  it('repassa: cliente paga total + taxa', async () => {
    if (!disponivel) return
    const { app, userId, lojaId } = await prepararLojaIntermediada('repassa')
    const pedido = await criarPedido(lojaId, 6000)
    const res = await app.inject({ method: 'POST', url: `/v1/pagamentos/pedidos/${pedido}/intermediado`, headers: authLoja(userId, lojaId), payload: { meio: 'pix' } })
    await app.close()
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json().valor_centavos).toBe(6050)
  })

  it('webhook concilia por assinatura valida e e idempotente; assinatura invalida e 401', async () => {
    if (!disponivel) return
    const { app, userId, lojaId } = await prepararLojaIntermediada('absorve')
    const pedido = await criarPedido(lojaId, 6000)
    const criada = await app.inject({ method: 'POST', url: `/v1/pagamentos/pedidos/${pedido}/intermediado`, headers: authLoja(userId, lojaId), payload: { meio: 'pix' } })
    const { rows } = await poolApi.query('select charge_ref from public.pagamentos where id=$1', [criada.json().id])
    const chargeRef = rows[0].charge_ref as string

    // O corpo CRU (string) e o que assinamos e enviamos: a verificacao e sobre os bytes recebidos.
    const corpo = JSON.stringify({ charge_ref: chargeRef, pago: true, taxa_psp: 99 })
    const assinatura = createHmac('sha256', 'asaas-key-xyz').update(corpo).digest('hex')
    const post = (sig: string | undefined, corpoRaw: string) =>
      app.inject({
        method: 'POST', url: '/v1/pagamentos/webhooks/psp/asaas',
        headers: { 'content-type': 'application/json', ...(sig ? { 'x-psp-signature': sig } : {}) },
        payload: corpoRaw,
      })

    // sem assinatura -> 401 (rejeicao barata antes da decifra)
    expect((await post(undefined, corpo)).statusCode).toBe(401)
    // assinatura invalida -> 401, nada concilia
    expect((await post('errada', corpo)).statusCode).toBe(401)

    // assinatura valida -> concilia
    const ok = await post(assinatura, corpo)
    expect(ok.statusCode, ok.body).toBe(200)
    const pago1 = await poolApi.query('select status, taxa_psp_centavos from public.pagamentos where charge_ref=$1', [chargeRef])
    expect(pago1.rows[0]).toMatchObject({ status: 'pago', taxa_psp_centavos: 99 })

    // replay do mesmo evento -> idempotente (segue pago)
    const replay = await post(assinatura, corpo)
    await app.close()
    expect(replay.statusCode).toBe(200)
    const pago2 = await poolApi.query('select status from public.pagamentos where charge_ref=$1', [chargeRef])
    expect(pago2.rows[0].status).toBe('pago')
  })

  it('absorve: taxa >= total do pedido e barrada (repasse nunca <= 0)', async () => {
    if (!disponivel) return
    const { app, userId, lojaId } = await prepararLojaIntermediada('absorve')
    // padrao de taxa = 50; pedido de 40 centavos em absorve -> taxa excede o total
    const pedido = await criarPedido(lojaId, 40)
    const res = await app.inject({ method: 'POST', url: `/v1/pagamentos/pedidos/${pedido}/intermediado`, headers: authLoja(userId, lojaId), payload: { meio: 'pix' } })
    await app.close()
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('taxa_excede_total')
  })
})

describe('PSP: nao integrado', () => {
  it('cobranca intermediada sem cliente PSP responde 501 (esperando as chaves do Asaas)', async () => {
    if (!disponivel) return
    const { userId, lojaId } = await criarContaLojaMembro('dono')
    const app = await montarApp(null) // sem PSP integrado
    await app.inject({ method: 'PUT', url: '/v1/pagamentos/config', headers: authLoja(userId, lojaId), payload: { pix_modo: 'intermediado' } })
    const pedido = await criarPedido(lojaId, 6000)
    const res = await app.inject({ method: 'POST', url: `/v1/pagamentos/pedidos/${pedido}/intermediado`, headers: authLoja(userId, lojaId), payload: { meio: 'pix' } })
    await app.close()
    expect(res.statusCode).toBe(501)
    expect(res.json().error.code).toBe('psp_nao_integrado')
  })
})
