// Integracao de ZAP-enviar-email contra o Postgres local (role whaviso_zap). Prova: claim
// FOR UPDATE SKIP LOCKED + envio pelo ClienteEmail (fake), reagendamento com backoff, teto ->
// falhou, template desconhecido -> falhou, e idle sem cliente (fila intacta).
import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { criarLogger } from '@whaviso/shared/logger'
import { drenarEmails } from '../src/modules/enviar_email'
import type { ClienteEmail, EmailParaEnviar, ResultadoEmail } from '../src/modules/enviar_email'
import { bancoAcessivel, fecharPools, poolSuper, poolZap } from './db'

const online = await bancoAcessivel()
if (!online) console.warn('[ZAP-enviar-email] Postgres local inacessivel: integracao PULADA.')

const logger = criarLogger('teste-enviar-email', 'silent')

/** Fake do ClienteEmail: desfecho programavel, registra as chamadas. */
class FakeClienteEmail implements ClienteEmail {
  chamadas: EmailParaEnviar[] = []
  constructor(private readonly resultado: (msg: EmailParaEnviar) => ResultadoEmail = () => ({ ok: true, providerId: 'prov_1' })) {}
  async enviar(msg: EmailParaEnviar): Promise<ResultadoEmail> {
    this.chamadas.push(msg)
    return this.resultado(msg)
  }
}

async function enfileirar(template = 'boas_vindas', extra: { tentativas?: number } = {}): Promise<string> {
  const id = randomUUID()
  await poolSuper.query(
    `insert into public.emails_outbox (id, para, template, payload, status, agendado_para, tentativas, dedupe_chave)
     values ($1,$2,$3,'{}'::jsonb,'agendado',now(),$4,$5)`,
    [id, `dest.${id.slice(0, 8)}@exemplo.com`, template, extra.tentativas ?? 0, `k:${id}`],
  )
  return id
}

interface LinhaEmail {
  status: string
  provider_id: string | null
  enviado_em: Date | null
  tentativas: number
  erro: string | null
  proxima_tentativa_em: Date | null
}
async function ler(id: string): Promise<LinhaEmail> {
  const { rows } = await poolSuper.query<LinhaEmail>(
    'select status, provider_id, enviado_em, tentativas, erro, proxima_tentativa_em from public.emails_outbox where id = $1',
    [id],
  )
  return rows[0]!
}

const deps = (cliente?: ClienteEmail) => ({ pool: poolZap, logger, cliente })

beforeAll(async () => {
  if (online) await poolSuper.query('delete from public.emails_outbox')
})
afterEach(async () => {
  if (online) await poolSuper.query('delete from public.emails_outbox')
})
afterAll(async () => {
  await fecharPools()
})

describe.skipIf(!online)('ZAP-enviar-email: dreno da outbox', () => {
  it('sucesso: renderiza boas_vindas, envia e grava status/provider_id/enviado_em', async () => {
    const id = await enfileirar()
    const cliente = new FakeClienteEmail()

    const resumo = await drenarEmails(deps(cliente))

    expect(resumo).toMatchObject({ idle: false, reivindicados: 1, enviados: 1, falhas: 0, reagendados: 0 })
    expect(cliente.chamadas[0]!.assunto).toMatch(/Whaviso/)
    const e = await ler(id)
    expect(e.status).toBe('enviado')
    expect(e.provider_id).toBe('prov_1')
    expect(e.enviado_em).not.toBeNull()
    expect(e.erro).toBeNull()
  })

  it('sem cliente: idle, fila intacta', async () => {
    const id = await enfileirar()
    const resumo = await drenarEmails(deps(undefined))
    expect(resumo.idle).toBe(true)
    expect(resumo.reivindicados).toBe(0)
    expect((await ler(id)).status).toBe('agendado')
  })

  it('falha retentavel: reagenda com backoff e consome tentativa', async () => {
    const id = await enfileirar()
    const cliente = new FakeClienteEmail(() => ({ ok: false, erro: { codigo: 'http_500', retentavel: true } }))

    const resumo = await drenarEmails(deps(cliente))

    expect(resumo).toMatchObject({ reivindicados: 1, reagendados: 1, enviados: 0, falhas: 0 })
    const e = await ler(id)
    expect(e.status).toBe('agendado')
    expect(e.tentativas).toBe(1)
    expect(e.proxima_tentativa_em).not.toBeNull()
    expect(e.erro).toBe('http_500')
  })

  it('falha retentavel no teto de tentativas -> falhou', async () => {
    const id = await enfileirar('boas_vindas', { tentativas: 4 }) // maxTentativas padrao = 5
    const cliente = new FakeClienteEmail(() => ({ ok: false, erro: { codigo: 'http_500', retentavel: true } }))

    const resumo = await drenarEmails(deps(cliente))

    expect(resumo).toMatchObject({ falhas: 1, reagendados: 0 })
    const e = await ler(id)
    expect(e.status).toBe('falhou')
    expect(e.tentativas).toBe(5)
  })

  it('template desconhecido -> falhou permanente (sem round-trip)', async () => {
    const id = await enfileirar('inexistente')
    const cliente = new FakeClienteEmail()

    const resumo = await drenarEmails(deps(cliente))

    expect(resumo.falhas).toBe(1)
    expect(cliente.chamadas).toHaveLength(0)
    const e = await ler(id)
    expect(e.status).toBe('falhou')
    expect(e.erro).toBe('template_desconhecido')
  })
})
