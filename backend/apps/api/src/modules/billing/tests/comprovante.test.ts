// Item 19 (leva 2026-07-22 1D, H11.14): comprovante de recarga validado por IA. Storage e
// OpenRouter são chamados por fetch puro (shared/storage_comprovantes,
// shared/validacao_comprovante); aqui stubamos o `fetch` global (sem rede real) e ligamos as
// credenciais só neste arquivo via `app.env` (mesmo objeto decorado no harness, mutado por
// instância; não vaza para outros arquivos de teste por causa do isolamento de módulos do
// vitest por arquivo).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { criarAppTeste, criarUsuario, encerrarPools, limparUsuario, poolSuper } from '../../../../test/harness'

const AUTH = { authorization: 'Bearer x' }
const ARQUIVO_BASE64 = Buffer.from('comprovante-fake').toString('base64')

async function criarRecarga(uid: string, quantidade = 50, valorCentavos = 4500): Promise<string> {
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.notificacoes_billing (profile_id, telefone_alvo, quantidade, valor_centavos)
     values ($1, '+5511988887777', $2, $3)
     returning id`,
    [uid, quantidade, valorCentavos],
  )
  return rows[0]!.id
}

async function saldoLivre(uid: string): Promise<number> {
  const { rows } = await poolSuper.query<{ saldo_livre: number }>(
    `select saldo_livre from public.creditos_carteira where profile_id = $1`,
    [uid],
  )
  return rows[0]!.saldo_livre
}

/** Stub do fetch global: diferencia Storage (upload/sign) de OpenRouter pela URL. */
function stubFetch(opts: { storageOk?: boolean; iaConfianca?: number; iaValorBate?: boolean | null }) {
  const { storageOk = true, iaConfianca = 0, iaValorBate = null } = opts
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/storage/v1/object/sign/')) {
        return {
          ok: true,
          json: async () => ({ signedURL: '/comprovantes/fake?token=x' }),
        } as Response
      }
      if (url.includes('/storage/v1/object/')) {
        return { ok: storageOk } as Response
      }
      if (url.includes('openrouter.ai')) {
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    confianca: iaConfianca,
                    valor_bate: iaValorBate,
                    motivo: 'teste',
                  }),
                },
              },
            ],
          }),
        } as Response
      }
      throw new Error(`fetch não esperado no teste: ${url}`)
    }),
  )
}

describe('billing comprovante de recarga (integração, item 19/H11.14)', () => {
  let u: string
  let owner: string

  beforeAll(async () => {
    u = await criarUsuario('Comprovante')
    owner = await criarUsuario('Owner comprovante')
    await poolSuper.query(`update public.profiles set role='owner' where id=$1`, [owner])
    // shared/validacao_comprovante lê OPENROUTER_API_KEY de process.env diretamente (ainda
    // fora do schema tipado de env, nota no MODULE.md); sem chave, a IA nunca é chamada de
    // verdade (curto-circuita em "ia_indisponivel"). Para exercitar os caminhos de alta/baixa
    // confiança, fixamos uma chave fake aqui (fetch é stubado, nunca sai para a rede real).
    process.env.OPENROUTER_API_KEY = 'fake-openrouter-key'
  })
  afterAll(async () => {
    delete process.env.OPENROUTER_API_KEY
    await limparUsuario(u)
    await limparUsuario(owner)
    await encerrarPools()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('exige autenticação (401 sem token)', async () => {
    const recargaId = await criarRecarga(u)
    const app = await criarAppTeste(u)
    const r = await app.inject({
      method: 'POST',
      url: `/v1/billing/recarga/${recargaId}/comprovante`,
      payload: { arquivo_base64: ARQUIVO_BASE64, arquivo_mime: 'image/png' },
    })
    await app.close()
    expect(r.statusCode).toBe(401)
  })

  it('recarga inexistente ou de outra conta: 404', async () => {
    const outraConta = await criarUsuario('Outra conta comprovante')
    const recargaDeOutraConta = await criarRecarga(outraConta)
    const app = await criarAppTeste(u)
    const r = await app.inject({
      method: 'POST',
      url: `/v1/billing/recarga/${recargaDeOutraConta}/comprovante`,
      headers: AUTH,
      payload: { arquivo_base64: ARQUIVO_BASE64, arquivo_mime: 'image/png' },
    })
    await app.close()
    expect(r.statusCode).toBe(404)
    await limparUsuario(outraConta)
  })

  it('sem SUPABASE_SERVICE_ROLE_KEY configurada: recusa com armazenamento_indisponivel', async () => {
    const recargaId = await criarRecarga(u)
    const app = await criarAppTeste(u) // envFake não tem SERVICE_ROLE_KEY (harness padrão)
    const r = await app.inject({
      method: 'POST',
      url: `/v1/billing/recarga/${recargaId}/comprovante`,
      headers: AUTH,
      payload: { arquivo_base64: ARQUIVO_BASE64, arquivo_mime: 'image/png' },
    })
    await app.close()
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('armazenamento_indisponivel')
  })

  it('IA com alta confiança e valor batendo: credita automaticamente e marca aprovado', async () => {
    const antes = await saldoLivre(u)
    const recargaId = await criarRecarga(u, 50, 4500)
    stubFetch({ storageOk: true, iaConfianca: 0.95, iaValorBate: true })
    const app = await criarAppTeste(u)
    app.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key'
    const r = await app.inject({
      method: 'POST',
      url: `/v1/billing/recarga/${recargaId}/comprovante`,
      headers: AUTH,
      payload: { arquivo_base64: ARQUIVO_BASE64, arquivo_mime: 'image/png' },
    })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().status).toBe('aprovado')
    expect(await saldoLivre(u)).toBe(antes + 50)

    const { rows } = await poolSuper.query<{ status: string; ia_confianca: string }>(
      `select status, ia_confianca from public.billing_comprovantes where recarga_id = $1`,
      [recargaId],
    )
    expect(rows[0]!.status).toBe('aprovado')
  })

  it('IA com baixa confiança: NÃO credita, fica aguardando_revisao_manual', async () => {
    const antes = await saldoLivre(u)
    const recargaId = await criarRecarga(u, 30, 2700)
    stubFetch({ storageOk: true, iaConfianca: 0.2, iaValorBate: true })
    const app = await criarAppTeste(u)
    app.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key'
    const r = await app.inject({
      method: 'POST',
      url: `/v1/billing/recarga/${recargaId}/comprovante`,
      headers: AUTH,
      payload: { arquivo_base64: ARQUIVO_BASE64, arquivo_mime: 'image/png' },
    })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().status).toBe('aguardando_revisao_manual')
    expect(await saldoLivre(u)).toBe(antes) // sem crédito automático
    return recargaId
  })

  it('valor não bate mesmo com confiança alta: fica aguardando_revisao_manual (não credita)', async () => {
    const antes = await saldoLivre(u)
    const recargaId = await criarRecarga(u, 30, 2700)
    stubFetch({ storageOk: true, iaConfianca: 0.99, iaValorBate: false })
    const app = await criarAppTeste(u)
    app.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key'
    const r = await app.inject({
      method: 'POST',
      url: `/v1/billing/recarga/${recargaId}/comprovante`,
      headers: AUTH,
      payload: { arquivo_base64: ARQUIVO_BASE64, arquivo_mime: 'image/png' },
    })
    await app.close()
    expect(r.json().status).toBe('aguardando_revisao_manual')
    expect(await saldoLivre(u)).toBe(antes)
  })

  it('Storage indisponível na hora do upload: recusa com armazenamento_indisponivel (IA nem é chamada)', async () => {
    const recargaId = await criarRecarga(u)
    stubFetch({ storageOk: false })
    const app = await criarAppTeste(u)
    app.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key'
    const r = await app.inject({
      method: 'POST',
      url: `/v1/billing/recarga/${recargaId}/comprovante`,
      headers: AUTH,
      payload: { arquivo_base64: ARQUIVO_BASE64, arquivo_mime: 'image/png' },
    })
    await app.close()
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('armazenamento_indisponivel')
  })

  it('reenviar um comprovante já aprovado: recusa com comprovante_ja_processado', async () => {
    const recargaId = await criarRecarga(u, 20, 1800)
    stubFetch({ storageOk: true, iaConfianca: 0.95, iaValorBate: true })
    const app = await criarAppTeste(u)
    app.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key'
    const primeira = await app.inject({
      method: 'POST',
      url: `/v1/billing/recarga/${recargaId}/comprovante`,
      headers: AUTH,
      payload: { arquivo_base64: ARQUIVO_BASE64, arquivo_mime: 'image/png' },
    })
    expect(primeira.json().status).toBe('aprovado')
    const segunda = await app.inject({
      method: 'POST',
      url: `/v1/billing/recarga/${recargaId}/comprovante`,
      headers: AUTH,
      payload: { arquivo_base64: ARQUIVO_BASE64, arquivo_mime: 'image/png' },
    })
    await app.close()
    expect(segunda.statusCode).toBe(422)
    expect(segunda.json().error.code).toBe('comprovante_ja_processado')
  })

  it('GET /billing/comprovantes/revisao é owner-only (403 para não-owner)', async () => {
    const app = await criarAppTeste(u)
    const r = await app.inject({ method: 'GET', url: '/v1/billing/comprovantes/revisao', headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(403)
  })

  it('owner lista pendentes e resolve (aprovar credita; rejeitar não credita)', async () => {
    // Pendente A: aprovar via /resolver credita a quantidade da recarga.
    const antesA = await saldoLivre(u)
    const recargaA = await criarRecarga(u, 40, 3600)
    stubFetch({ storageOk: true, iaConfianca: 0.3, iaValorBate: true })
    const appEnvio = await criarAppTeste(u)
    appEnvio.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key'
    const envioA = await appEnvio.inject({
      method: 'POST',
      url: `/v1/billing/recarga/${recargaA}/comprovante`,
      headers: AUTH,
      payload: { arquivo_base64: ARQUIVO_BASE64, arquivo_mime: 'application/pdf' },
    })
    await appEnvio.close()
    expect(envioA.json().status).toBe('aguardando_revisao_manual')
    const comprovanteA = envioA.json().id as string

    const appOwner = await criarAppTeste(owner)
    appOwner.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ signedURL: '/x?token=y' }) }) as Response),
    )
    const listagem = await appOwner.inject({ method: 'GET', url: '/v1/billing/comprovantes/revisao', headers: AUTH })
    expect(listagem.statusCode).toBe(200)
    const itens = listagem.json().itens as Array<{ id: string; recarga_id: string; quantidade: number }>
    expect(itens.some((i) => i.id === comprovanteA)).toBe(true)

    const aprovar = await appOwner.inject({
      method: 'POST',
      url: `/v1/billing/comprovantes/${comprovanteA}/resolver`,
      headers: AUTH,
      payload: { aprovado: true },
    })
    expect(aprovar.statusCode).toBe(200)
    expect(aprovar.json().status).toBe('aprovado')
    expect(await saldoLivre(u)).toBe(antesA + 40)

    // Resolver de novo (já não está mais pendente): recusa.
    const resolverDeNovo = await appOwner.inject({
      method: 'POST',
      url: `/v1/billing/comprovantes/${comprovanteA}/resolver`,
      headers: AUTH,
      payload: { aprovado: true },
    })
    expect(resolverDeNovo.statusCode).toBe(422)
    expect(resolverDeNovo.json().error.code).toBe('comprovante_nao_pendente')

    // Pendente B: rejeitar via /resolver NÃO credita.
    const antesB = await saldoLivre(u)
    const recargaB = await criarRecarga(u, 15, 1400)
    const appEnvioB = await criarAppTeste(u)
    appEnvioB.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key'
    stubFetch({ storageOk: true, iaConfianca: 0.1, iaValorBate: null })
    const envioBReal = await appEnvioB.inject({
      method: 'POST',
      url: `/v1/billing/recarga/${recargaB}/comprovante`,
      headers: AUTH,
      payload: { arquivo_base64: ARQUIVO_BASE64, arquivo_mime: 'image/jpeg' },
    })
    await appEnvioB.close()
    const comprovanteB = envioBReal.json().id as string

    const rejeitar = await appOwner.inject({
      method: 'POST',
      url: `/v1/billing/comprovantes/${comprovanteB}/resolver`,
      headers: AUTH,
      payload: { aprovado: false },
    })
    await appOwner.close()
    expect(rejeitar.statusCode).toBe(200)
    expect(rejeitar.json().status).toBe('rejeitado')
    expect(await saldoLivre(u)).toBe(antesB) // rejeitar não credita
  })
})
