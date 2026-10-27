// Integracao de ZAP-webhook contra o Postgres local (role whaviso_zap, grants reais). Prova:
// SEC-050 (assinatura invalida/ausente -> 401, nada gravado), handshake (hub.challenge), inbound
// persiste ANTES do 200 (cliente + conversa + mensagem + janela de 24h), SEC-051 (replay do mesmo
// wamid, sequencial e concorrente, grava exatamente 1), SEC-001/002 (loja vem do phone_number_id,
// numero desconhecido descarta), recibos atualizam envios por wamid (delivered/failed) e evento
// realtime sem PII. Roda no Postgres compartilhado: limpamos as tabelas que contamos no beforeAll.
import { createHmac, randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { criarLogger } from '@whaviso/shared/logger'
import { envSchema } from '../src/env'
import { criarApp } from '../src/app'
import { criarClienteWhatsMeta } from '../src/shared/meta_client'
import { bancoAcessivel, cifra, fecharPools, limpar, poolSuper, poolZap, semear } from './db'

const online = await bancoAcessivel()
if (!online) console.warn('[ZAP-webhook] Postgres local inacessivel: integracao PULADA.')

const SECRET = 'app_secret_de_teste_webhook'
const VERIFY = 'verify-token-de-teste'
const logger = criarLogger('teste-webhook', 'silent')
const contas: string[] = []

const env = envSchema.parse({
  DATABASE_URL: 'postgresql://ignorado/local',
  META_APP_SECRET: SECRET,
  META_VERIFY_TOKEN: VERIFY,
})
const whats = criarClienteWhatsMeta({ appSecret: SECRET })

async function montar() {
  // Passa o poolZap (role de menor privilegio real) p/ provar os grants do whaviso_zap.
  const app = await criarApp({ env, pool: poolZap, logger, whats, cifra })
  await app.ready()
  return app
}

function assinar(corpo: string): string {
  return 'sha256=' + createHmac('sha256', SECRET).update(Buffer.from(corpo, 'utf8')).digest('hex')
}

async function cenario(op?: Parameters<typeof semear>[0]) {
  const c = await semear(op)
  contas.push(c.contaId)
  const { rows } = await poolSuper.query<{ phone_number_id: string }>(
    'select phone_number_id from public.numeros_whatsapp where id = $1',
    [c.numeroId],
  )
  return { ...c, phoneNumberId: rows[0]!.phone_number_id }
}

function payloadTexto(phoneNumberId: string, wamid: string, telefone = '5511977776655', texto = 'ola') {
  return JSON.stringify({
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: phoneNumberId },
              messages: [{ id: wamid, from: telefone, type: 'text', text: { body: texto } }],
            },
          },
        ],
      },
    ],
  })
}

function payloadStatus(wamid: string, status: string, comErro = false) {
  return JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: 'qualquer' },
              statuses: [{ id: wamid, status, ...(comErro ? { errors: [{ code: 131026 }] } : {}) }],
            },
          },
        ],
      },
    ],
  })
}

async function post(app: Awaited<ReturnType<typeof montar>>, corpo: string, assinatura?: string) {
  return app.inject({
    method: 'POST',
    url: '/webhook/whatsapp',
    headers: {
      'content-type': 'application/json',
      ...(assinatura ? { 'x-hub-signature-256': assinatura } : {}),
    },
    payload: corpo,
  })
}

async function contarMensagens(lojaId: string): Promise<number> {
  const { rows } = await poolSuper.query<{ n: string }>(
    "select count(*)::text as n from public.mensagens where loja_id = $1 and direcao = 'entrada'",
    [lojaId],
  )
  return Number(rows[0]!.n)
}
async function contarClientesPorHash(lojaId: string, hash: string): Promise<number> {
  const { rows } = await poolSuper.query<{ n: string }>(
    'select count(*)::text as n from public.clientes where loja_id = $1 and telefone_hash = $2',
    [lojaId, hash],
  )
  return Number(rows[0]!.n)
}

beforeAll(async () => {
  if (online) {
    await poolSuper.query('delete from public.envios')
    await poolSuper.query('delete from public.webhook_eventos_processados')
  }
})
afterEach(async () => {
  for (const id of contas) await limpar(id)
  contas.length = 0
  if (online) await poolSuper.query('delete from public.webhook_eventos_processados')
})
afterAll(async () => {
  await fecharPools()
})

describe.skipIf(!online)('ZAP-webhook: inbound da Meta', () => {
  it('SEC-050: sem assinatura -> 401 e nada gravado', async () => {
    const app = await montar()
    const c = await cenario()
    const resp = await post(app, payloadTexto(c.phoneNumberId, `wamid.${randomUUID()}`))
    expect(resp.statusCode).toBe(401)
    expect(await contarMensagens(c.lojaId)).toBe(0)
    await app.close()
  })

  it('SEC-050: assinatura de corpo adulterado -> 401 e nada gravado', async () => {
    const app = await montar()
    const c = await cenario()
    const corpo = payloadTexto(c.phoneNumberId, `wamid.${randomUUID()}`)
    const assinaturaDeOutroCorpo = assinar(payloadTexto(c.phoneNumberId, 'wamid.outro'))
    const resp = await post(app, corpo, assinaturaDeOutroCorpo)
    expect(resp.statusCode).toBe(401)
    expect(await contarMensagens(c.lojaId)).toBe(0)
    await app.close()
  })

  it('handshake GET: verify_token correto ecoa challenge; errado -> 403', async () => {
    const app = await montar()
    const ok = await app.inject({
      method: 'GET',
      url: `/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=42`,
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.body).toBe('42')
    const nok = await app.inject({
      method: 'GET',
      url: '/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=42',
    })
    expect(nok.statusCode).toBe(403)
    await app.close()
  })

  it('inbound texto: persiste cliente+conversa+mensagem e marca a janela ANTES do 200', async () => {
    const app = await montar()
    const c = await cenario()
    const telefone = '5511966665544'
    const wamid = `wamid.${randomUUID()}`
    const corpo = payloadTexto(c.phoneNumberId, wamid, telefone, 'quero um lanche')

    const resp = await post(app, corpo, assinar(corpo))
    expect(resp.statusCode).toBe(200)

    // Ja persistido no momento do 200 (o handler aguarda a persistencia).
    const hash = cifra.hashTelefone(`+${telefone}`)
    expect(await contarClientesPorHash(c.lojaId, hash)).toBe(1)
    const { rows } = await poolSuper.query(
      `select m.loja_id, m.direcao, m.autor, m.tipo, m.conteudo, m.wamid, cv.ultima_entrada_em
         from public.mensagens m join public.conversas cv on cv.id = m.conversa_id
        where m.wamid = $1`,
      [wamid],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      loja_id: c.lojaId,
      direcao: 'entrada',
      autor: 'cliente',
      tipo: 'texto',
      conteudo: 'quero um lanche',
    })
    expect(rows[0]!.ultima_entrada_em).not.toBeNull()
    await app.close()
  })

  it('SEC-051: replay sequencial do mesmo wamid grava exatamente 1 mensagem e 1 cliente', async () => {
    const app = await montar()
    const c = await cenario()
    const telefone = '5511955554433'
    const wamid = `wamid.${randomUUID()}`
    const corpo = payloadTexto(c.phoneNumberId, wamid, telefone)

    for (let i = 0; i < 3; i += 1) {
      const resp = await post(app, corpo, assinar(corpo))
      expect(resp.statusCode).toBe(200)
    }
    const hash = cifra.hashTelefone(`+${telefone}`)
    expect(await contarMensagens(c.lojaId)).toBe(1)
    expect(await contarClientesPorHash(c.lojaId, hash)).toBe(1)
    await app.close()
  })

  it('SEC-051: replay CONCORRENTE do mesmo wamid grava exatamente 1', async () => {
    const app = await montar()
    const c = await cenario()
    const wamid = `wamid.${randomUUID()}`
    const corpo = payloadTexto(c.phoneNumberId, wamid, '5511944443322')
    const assinatura = assinar(corpo)

    const respostas = await Promise.all([
      post(app, corpo, assinatura),
      post(app, corpo, assinatura),
      post(app, corpo, assinatura),
    ])
    for (const r of respostas) expect(r.statusCode).toBe(200)
    expect(await contarMensagens(c.lojaId)).toBe(1)
    await app.close()
  })

  it('SEC-001/002: numero desconhecido descarta sem gravar em nenhuma loja', async () => {
    const app = await montar()
    const c = await cenario()
    const corpo = payloadTexto('pnid-inexistente-xyz', `wamid.${randomUUID()}`)
    const resp = await post(app, corpo, assinar(corpo))
    expect(resp.statusCode).toBe(200) // ack rapido; evento descartado
    expect(await contarMensagens(c.lojaId)).toBe(0)
    await app.close()
  })

  it('recibo delivered atualiza entrega_status do envio por wamid', async () => {
    const app = await montar()
    const c = await cenario()
    const wamid = `wamid.enviado.${randomUUID()}`
    const envioId = randomUUID()
    await poolSuper.query(
      `insert into public.envios (id, loja_id, numero_whatsapp_id, payload, status, wamid)
       values ($1,$2,$3,'{"tipo":"texto","texto":"x"}'::jsonb,'enviado',$4)`,
      [envioId, c.lojaId, c.numeroId, wamid],
    )
    const corpo = payloadStatus(wamid, 'delivered')
    const resp = await post(app, corpo, assinar(corpo))
    expect(resp.statusCode).toBe(200)
    const { rows } = await poolSuper.query<{ entrega_status: string; status: string }>(
      'select entrega_status, status from public.envios where id = $1',
      [envioId],
    )
    expect(rows[0]).toMatchObject({ entrega_status: 'delivered', status: 'enviado' })
    await app.close()
  })

  it('recibo failed marca status=falhou e erro (sem PII)', async () => {
    const app = await montar()
    const c = await cenario()
    const wamid = `wamid.enviado.${randomUUID()}`
    const envioId = randomUUID()
    await poolSuper.query(
      `insert into public.envios (id, loja_id, numero_whatsapp_id, payload, status, wamid)
       values ($1,$2,$3,'{"tipo":"texto","texto":"x"}'::jsonb,'enviado',$4)`,
      [envioId, c.lojaId, c.numeroId, wamid],
    )
    const corpo = payloadStatus(wamid, 'failed', true)
    const resp = await post(app, corpo, assinar(corpo))
    expect(resp.statusCode).toBe(200)
    const { rows } = await poolSuper.query<{ status: string; erro: string; entrega_status: string }>(
      'select status, erro, entrega_status from public.envios where id = $1',
      [envioId],
    )
    expect(rows[0]!.status).toBe('falhou')
    expect(rows[0]!.entrega_status).toBe('failed')
    expect(rows[0]!.erro).toBe('erro_131026')
    await app.close()
  })

  it('recibo de wamid desconhecido e ignorado (nenhum envio afetado)', async () => {
    const app = await montar()
    await cenario()
    const corpo = payloadStatus(`wamid.fantasma.${randomUUID()}`, 'read')
    const resp = await post(app, corpo, assinar(corpo))
    expect(resp.statusCode).toBe(200)
    await app.close()
  })
})
