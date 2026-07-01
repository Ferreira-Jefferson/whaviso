// Integração do sincronizar_templates: claim/submit/reconcile contra o banco (whaviso_zap),
// com a Graph API mockada via stub de `fetch` (sem rede). Cobre create, EDIT, erro permanente
// (rejeitado), reconcile (status real + rebaixa aprovado fantasma) e o webhook de status.
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { submeterPendentes, reconciliarTemplates, processarStatusTemplate } from '../index'
import { poolSuper, poolZap, encerrarPools } from '../../../../test/harness'

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never
const metaOpcoes = {
  accessToken: 'token',
  phoneNumberId: 'phone',
  wabaId: 'WABA1',
  appSecret: 'secret',
  verifyToken: 'verify',
  graphUrl: 'https://graph.facebook.com',
  apiVersion: 'v23.0',
}

// Resposta fake no shape que graph.ts espera (resp.ok + resp.json()).
function resp(json: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => json } as unknown as Response
}

async function inserirTemplate(over: {
  nome_meta: string
  meta_acao?: string | null
  meta_template_id?: string | null
  status_meta?: string
  ativo?: boolean
}): Promise<string> {
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.templates
       (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo, categoria, exemplos, meta_acao, meta_template_id)
     values ('teste.sync','padrao',$1,'pt_BR','{"texto":"Oi {{1}}"}'::jsonb,'["nome"]'::jsonb,
             $2::status_meta_template, $3, 'UTILITY', '{"nome":"Maria"}'::jsonb, $4, $5)
     returning id`,
    [over.nome_meta, over.status_meta ?? 'pendente', over.ativo ?? false, over.meta_acao ?? null, over.meta_template_id ?? null],
  )
  return rows[0]!.id
}

async function lerTemplate(id: string): Promise<{
  status_meta: string
  meta_acao: string | null
  meta_template_id: string | null
  meta_motivo: string | null
  meta_submetido_em: Date | null
}> {
  const { rows } = await poolSuper.query(
    `select status_meta, meta_acao, meta_template_id, meta_motivo, meta_submetido_em from public.templates where id=$1`,
    [id],
  )
  return rows[0]
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await poolSuper.query(`delete from public.templates where chave='teste.sync'`)
})

afterAll(async () => {
  await encerrarPools()
})

describe('submeterPendentes', () => {
  it('CREATE: cria na WABA, grava meta_template_id + pendente, zera meta_acao', async () => {
    const id = await inserirTemplate({ nome_meta: 'teste_sync_create', meta_acao: 'criar' })
    let urlChamada = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urlChamada = url
        return resp({ id: 'MT_100', status: 'PENDING' })
      }),
    )

    const n = await submeterPendentes({ pool: poolZap, logger, metaOpcoes })
    expect(n).toBe(1)
    expect(urlChamada).toContain('/WABA1/message_templates')

    const t = await lerTemplate(id)
    expect(t.meta_template_id).toBe('MT_100')
    expect(t.status_meta).toBe('pendente')
    expect(t.meta_acao).toBeNull()
    expect(t.meta_submetido_em).not.toBeNull()
  })

  it('EDIT: já tem meta_template_id -> POST no /{template_id}, não no create', async () => {
    await inserirTemplate({ nome_meta: 'teste_sync_edit', meta_acao: 'criar', meta_template_id: 'MT_EXIST' })
    let urlChamada = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urlChamada = url
        return resp({ id: 'MT_EXIST', status: 'PENDING' })
      }),
    )

    await submeterPendentes({ pool: poolZap, logger, metaOpcoes })
    expect(urlChamada).toContain('/MT_EXIST')
    expect(urlChamada).not.toContain('message_templates')
  })

  it('erro permanente da Meta -> rejeitado com motivo, sem reenfileirar', async () => {
    const id = await inserirTemplate({ nome_meta: 'teste_sync_rej', meta_acao: 'criar' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => resp({ error: { code: 132000, message: 'invalid components' } }, false, 400)),
    )

    await submeterPendentes({ pool: poolZap, logger, metaOpcoes })
    const t = await lerTemplate(id)
    expect(t.status_meta).toBe('rejeitado')
    expect(t.meta_motivo).toContain('132000')
    expect(t.meta_acao).toBeNull()
  })

  it('falha transitória (5xx) -> recoloca meta_acao=criar', async () => {
    const id = await inserirTemplate({ nome_meta: 'teste_sync_tx', meta_acao: 'criar' })
    vi.stubGlobal('fetch', vi.fn(async () => resp({ error: { message: 'upstream' } }, false, 503)))

    const n = await submeterPendentes({ pool: poolZap, logger, metaOpcoes })
    expect(n).toBe(0)
    const t = await lerTemplate(id)
    expect(t.meta_acao).toBe('criar')
    expect(t.status_meta).toBe('pendente')
  })
})

describe('processarStatusTemplate', () => {
  it('aplica o veredito por (nome_meta, idioma)', async () => {
    const id = await inserirTemplate({ nome_meta: 'teste_sync_ws', status_meta: 'pendente' })
    await processarStatusTemplate(
      { pool: poolZap, logger },
      { nomeMeta: 'teste_sync_ws', idioma: 'pt_BR', status: 'aprovado' },
    )
    expect((await lerTemplate(id)).status_meta).toBe('aprovado')
  })
})

describe('reconciliarTemplates', () => {
  it('reflete o status real da lista por (nome_meta, idioma); não toca quem não está na lista', async () => {
    const naMeta = await inserirTemplate({ nome_meta: 'teste_sync_na_meta', status_meta: 'pendente' })
    const foraDaLista = await inserirTemplate({ nome_meta: 'teste_sync_fora', status_meta: 'aprovado' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        resp({ data: [{ name: 'teste_sync_na_meta', language: 'pt_BR', status: 'APPROVED', id: 'MT_X' }] }),
      ),
    )

    await reconciliarTemplates({ pool: poolZap, logger, metaOpcoes })
    expect((await lerTemplate(naMeta)).status_meta).toBe('aprovado')
    // Quem não veio na lista fica intocado (sem rebaixar em massa por ausência).
    expect((await lerTemplate(foraDaLista)).status_meta).toBe('aprovado')
  })
})
