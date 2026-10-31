// Credenciais de plataforma (numero oficial do WhatsApp + e-mail). Integracao no Postgres LOCAL.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { criarCifra } from '@whaviso/shared/cifra'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarOperador, criarUsuario, fecharPools, limpar, novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { criarRotasCredenciaisPlataforma } from './routes'
import { criarCifraCredenciaisPlataforma } from './cripto'

const MASTER_KEY = 'master-key-de-teste-credenciais-plataforma-0123456789abcdef'

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
})

const online = await bancoAcessivel()
const d = online ? describe : describe.skip

d('credenciais_plataforma: whatsapp oficial e e-mail (integracao)', () => {
  const cen = novoCenario()
  let app: Awaited<ReturnType<typeof construirApp>>
  let admin: string, comum: string

  const req = (quem: string, metodo: 'GET' | 'PUT', url: string, payload?: unknown) =>
    app.inject({
      method: metodo,
      url: `/v1/credenciais-plataforma${url}`,
      headers: { authorization: `Bearer ${quem}` },
      payload: payload as object | undefined,
    })

  beforeAll(async () => {
    app = await construirApp({
      env: { ...env, RATE_LIMIT_DESLIGADO: true },
      pool: poolApi,
      logger: criarLogger('credenciais-plataforma-teste', 'error'),
      verificador: verificadorFake,
      modulos: [{
        prefixo: 'credenciais-plataforma',
        plugin: criarRotasCredenciaisPlataforma({ cifra: criarCifraCredenciaisPlataforma(MASTER_KEY) }),
      }],
    })
    await app.ready()
    admin = await criarUsuario(cen)
    await criarOperador(admin, 'admin')
    comum = await criarUsuario(cen)
    await criarOperador(comum, 'operador')
  })

  afterAll(async () => {
    await app.close()
    await poolSuper.query('update public.credenciais_whatsapp_oficial set phone_number_id = null, waba_id = null, access_token_cifrado = null where id = 1')
    await poolSuper.query('update public.credenciais_email_plataforma set remetente = null, api_key_cifrada = null where id = 1')
    await limpar(cen)
    await fecharPools()
  })

  it('whatsapp oficial: comeca nao configurada; admin define, token cifrado em repouso e nunca na resposta', async () => {
    const vazio = await req(admin, 'GET', '/whatsapp-oficial')
    expect(vazio.statusCode, vazio.body).toBe(200)
    expect(vazio.json()).toMatchObject({ configurada: false, phone_number_id: null })

    const token = 'EAAG-token-secreto-do-numero-oficial-0123456789'
    const put = await req(admin, 'PUT', '/whatsapp-oficial', {
      access_token: token, phone_number_id: '1234567890', waba_id: '999888777',
    })
    expect(put.statusCode, put.body).toBe(200)
    expect(put.json()).toMatchObject({ configurada: true, phone_number_id: '1234567890', waba_id: '999888777' })
    expect(put.body).not.toContain(token)

    const get = await req(admin, 'GET', '/whatsapp-oficial')
    expect(get.json()).toMatchObject({ configurada: true, phone_number_id: '1234567890' })
    expect(get.body).not.toContain(token)

    const { rows } = await poolSuper.query(
      'select access_token_cifrado from public.credenciais_whatsapp_oficial where id = 1',
    )
    const cifrado = rows[0].access_token_cifrado as Buffer
    expect(cifrado.toString('utf8')).not.toContain(token)
    expect(criarCifra(MASTER_KEY).decifrar(cifrado).toString('utf8')).toBe(token)
  })

  it('e-mail: comeca nao configurada; admin define, chave cifrada em repouso e nunca na resposta', async () => {
    const vazio = await req(admin, 'GET', '/email')
    expect(vazio.json()).toMatchObject({ configurada: false, remetente: null })

    const chave = 're_chave_secreta_resend_0123456789'
    const put = await req(admin, 'PUT', '/email', { api_key: chave, remetente: 'Whaviso <nao-responda@whaviso.com>' })
    expect(put.statusCode, put.body).toBe(200)
    expect(put.json()).toMatchObject({ configurada: true, remetente: 'Whaviso <nao-responda@whaviso.com>' })
    expect(put.body).not.toContain(chave)

    const { rows } = await poolSuper.query(
      'select api_key_cifrada from public.credenciais_email_plataforma where id = 1',
    )
    const cifrado = rows[0].api_key_cifrada as Buffer
    expect(criarCifra(MASTER_KEY).decifrar(cifrado).toString('utf8')).toBe(chave)
  })

  it('operador comum recebe 403 em todas as rotas (acesso so admin com chaves_api:gerir)', async () => {
    expect((await req(comum, 'GET', '/whatsapp-oficial')).statusCode).toBe(403)
    expect((await req(comum, 'PUT', '/whatsapp-oficial', { access_token: 'x', phone_number_id: 'y' })).statusCode).toBe(403)
    expect((await req(comum, 'GET', '/email')).statusCode).toBe(403)
    expect((await req(comum, 'PUT', '/email', { api_key: 'x', remetente: 'a@b.com' })).statusCode).toBe(403)
  })
})
