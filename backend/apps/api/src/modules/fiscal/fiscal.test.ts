// Integracao + seguranca do modulo fiscal. Testes de banco rodam no Postgres LOCAL (whaviso_dev,
// PGDATABASE sobrepoe) e se PULAM com aviso se o banco nao estiver acessivel.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'
import { falha, FakeClienteFiscal, Transitorio } from '@whaviso/shared/clientes'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { verificadorFake } from '../../../test/app'
import { criarCifraFiscal } from './cifra'
import { criarRotasFiscal } from './routes'
import type { DepsFiscal } from './service'

const HOST = process.env.PGHOST ?? '127.0.0.1'
const DB = process.env.PGDATABASE ?? 'whaviso_dev'

function senhaSuper(): string {
  try {
    const aqui = dirname(fileURLToPath(import.meta.url))
    const txt = readFileSync(resolve(aqui, '../../../../../.env'), 'utf8')
    for (const linha of txt.split('\n')) {
      const m = /^\s*POSTGRES_PASSWORD\s*=\s*(.*)\s*$/.exec(linha)
      if (m) return m[1]!.replace(/^["']|["']$/g, '').trim()
    }
  } catch {
    /* sem .env */
  }
  return process.env.POSTGRES_PASSWORD ?? 'postgres'
}

const poolApi = new pg.Pool({ host: HOST, port: 5432, user: 'whaviso_api', password: 'whaviso_api_dev', database: DB, max: 3 })
const poolSuper = new pg.Pool({ host: HOST, port: 5432, user: 'postgres', password: senhaSuper(), database: DB, max: 3 })

async function bancoAcessivel(): Promise<boolean> {
  try {
    await poolApi.query('select 1')
    await poolSuper.query('select 1')
    await poolSuper.query('select 1 from public.documentos_fiscais limit 1')
    return true
  } catch {
    return false
  }
}

const SEGREDO = 'tok-SENTINELA-EMISSOR-FISCAL-NAO-VAZA-0123456789'
const MASTER_KEY = 'fiscal-master-key-de-teste-0123456789-abcdef'
const cifra = criarCifraFiscal(MASTER_KEY)

const env = envSchema.parse({
  DATABASE_URL: `postgresql://whaviso_api:whaviso_api_dev@${HOST}:5432/${DB}`,
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_DESLIGADO: 'true',
})

async function montarApp(deps: DepsFiscal) {
  return construirApp({
    env, pool: poolApi, logger: false, verificador: verificadorFake,
    modulos: [{ prefixo: 'fiscal', plugin: criarRotasFiscal(deps) }],
  })
}

interface Fixtura { contaId: string; userId: string; lojaId: string; outraLojaId: string }
const usuarios: string[] = []
const contas: string[] = []

async function seed(papel: 'dono' | 'gerente' | 'atendente'): Promise<Fixtura> {
  const userId = randomUUID()
  await poolSuper.query('insert into auth.users (id) values ($1)', [userId])
  usuarios.push(userId)
  const contaId = randomUUID()
  await poolSuper.query('insert into public.contas (id, dono_user_id, nome) values ($1,$2,$3)', [contaId, userId, 'Conta de teste'])
  contas.push(contaId)
  const lojaId = randomUUID()
  const outraLojaId = randomUUID()
  for (const id of [lojaId, outraLojaId]) {
    await poolSuper.query('insert into public.lojas (id, conta_id, nome, ativo) values ($1,$2,$3,true)', [id, contaId, 'Loja de teste'])
  }
  await poolSuper.query(
    'insert into public.membros (conta_id, loja_id, user_id, papel, ativo) values ($1,$2,$3,$4,true)',
    [contaId, lojaId, userId, papel],
  )
  return { contaId, userId, lojaId, outraLojaId }
}

/** Cria categoria + item de catalogo e  seu dado fiscal. Devolve o item_id. */
async function itemCatalogo(lojaId: string, comFiscal: boolean): Promise<string> {
  const { rows: cat } = await poolSuper.query<{ id: string }>(
    `insert into public.categorias (loja_id, nome) values ($1,'Pizzas') returning id`,
    [lojaId],
  )
  const { rows: it } = await poolSuper.query<{ id: string }>(
    `insert into public.itens (loja_id, categoria_id, nome, preco_centavos) values ($1,$2,'Pizza',3500) returning id`,
    [lojaId, cat[0]!.id],
  )
  if (comFiscal) {
    await poolSuper.query(
      `insert into public.itens_fiscais (loja_id, item_id, ncm, cfop, origem, unidade, csosn)
       values ($1,$2,'21069090','5102',0,'UN','102')`,
      [lojaId, it[0]!.id],
    )
  }
  return it[0]!.id
}

async function pedido(lojaId: string, status = 'novo', comItens = true, comFiscal = true): Promise<string> {
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.pedidos (loja_id, codigo, status, subtotal_centavos, total_centavos)
     values ($1,$2,$3,3500,3500) returning id`,
    [lojaId, `F${Math.floor(Math.random() * 1e6)}`, status],
  )
  const id = rows[0]!.id
  if (comItens) {
    const itemId = comFiscal ? await itemCatalogo(lojaId, true) : null
    await poolSuper.query(
      `insert into public.itens_pedido (pedido_id, loja_id, item_id, nome_snapshot, preco_unitario_centavos, quantidade, total_centavos)
       values ($1,$2,$3,'Pizza',3500,1,3500)`,
      [id, lojaId, itemId],
    )
  }
  return id
}

const hdr = (f: Fixtura, loja = f.lojaId) => ({ authorization: `Bearer ${f.userId}`, 'x-loja-id': loja })
const CONFIG = { credencial: SEGREDO, cnpj: '12345678000195', regime: 'simples_nacional' }

let disponivel = false
beforeAll(async () => {
  disponivel = await bancoAcessivel()
  if (!disponivel) console.warn('[fiscal] banco indisponivel (ou migration 0051 nao aplicada): testes de integracao pulados')
})
afterEach(async () => {
  for (const c of contas.splice(0)) await poolSuper.query('delete from public.contas where id=$1', [c]).catch(() => {})
  for (const u of usuarios.splice(0)) await poolSuper.query('delete from auth.users where id=$1', [u]).catch(() => {})
})
afterAll(async () => {
  await poolApi.end().catch(() => {})
  await poolSuper.end().catch(() => {})
})

describe('config fiscal', () => {
  it('sem config: configurada=false; PUT grava cifrado e nao devolve a credencial', async () => {
    if (!disponivel) return
    const f = await seed('dono')
    const app = await montarApp({ cifra, emissor: new FakeClienteFiscal() })
    const vazio = await app.inject({ method: 'GET', url: '/v1/fiscal/config', headers: hdr(f) })
    expect(vazio.statusCode).toBe(200)
    expect(vazio.json().configurada).toBe(false)

    const put = await app.inject({ method: 'PUT', url: '/v1/fiscal/config', headers: hdr(f), payload: CONFIG })
    expect(put.statusCode).toBe(200)
    expect(put.json()).toMatchObject({ configurada: true, ultimos4: '6789', serie_nfce: 1, ambiente: 'homologacao' })
    expect(put.body).not.toContain(SEGREDO)

    const { rows } = await poolSuper.query('select credencial_cifrada from public.fiscal_config where loja_id=$1', [f.lojaId])
    expect(Buffer.from(rows[0].credencial_cifrada).toString('latin1')).not.toContain(SEGREDO)
    expect((await app.inject({ method: 'GET', url: '/v1/fiscal/config', headers: hdr(f) })).body).not.toContain(SEGREDO)
    await app.close()
  })

  it('so o dono escreve a config; gerente le; atendente nao alcanca; corpo estrito', async () => {
    if (!disponivel) return
    const g = await seed('gerente')
    const a = await seed('atendente')
    const app = await montarApp({ cifra, emissor: new FakeClienteFiscal() })
    expect((await app.inject({ method: 'PUT', url: '/v1/fiscal/config', headers: hdr(g), payload: CONFIG })).statusCode).toBe(403)
    expect((await app.inject({ method: 'GET', url: '/v1/fiscal/config', headers: hdr(g) })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/v1/fiscal/config', headers: hdr(a) })).statusCode).toBe(403)
    const d = await seed('dono')
    const ruim = await app.inject({ method: 'PUT', url: '/v1/fiscal/config', headers: hdr(d), payload: { ...CONFIG, loja_id: d.outraLojaId } })
    expect(ruim.statusCode).toBeGreaterThanOrEqual(400)
    const cnpjRuim = await app.inject({ method: 'PUT', url: '/v1/fiscal/config', headers: hdr(d), payload: { ...CONFIG, cnpj: '123' } })
    expect(cnpjRuim.statusCode).toBeGreaterThanOrEqual(400)
    await app.close()
  })

  it('PATCH ajusta sem reenviar a credencial e desativa', async () => {
    if (!disponivel) return
    const f = await seed('dono')
    const app = await montarApp({ cifra, emissor: new FakeClienteFiscal() })
    await app.inject({ method: 'PUT', url: '/v1/fiscal/config', headers: hdr(f), payload: CONFIG })
    const p = await app.inject({ method: 'PATCH', url: '/v1/fiscal/config', headers: hdr(f), payload: { ambiente: 'producao', ativo: false } })
    expect(p.json()).toMatchObject({ ambiente: 'producao', ativo: false, configurada: false })
    await app.close()
  })
})

describe('documentos fiscais', () => {
  async function comConfig(emissor: FakeClienteFiscal, papel: 'dono' | 'gerente' = 'dono') {
    const f = await seed(papel)
    const app = await montarApp({ cifra, emissor })
    await poolSuper.query(
      `insert into public.fiscal_config (loja_id, credencial_cifrada, ultimos4, cnpj, regime)
       values ($1,$2,'6789','12345678000195','simples_nacional')`,
      [f.lojaId, cifra.cifrar(SEGREDO)],
    )
    return { f, app }
  }

  it('emite: grava emitido com chave e link, chama o emissor com a credencial decifrada', async () => {
    if (!disponivel) return
    const emissor = new FakeClienteFiscal()
    const { f, app } = await comConfig(emissor, 'gerente')
    const pid = await pedido(f.lojaId)
    const r = await app.inject({ method: 'POST', url: '/v1/fiscal/documentos', headers: hdr(f), payload: { pedido_id: pid, tipo: 'nfce' } })
    expect(r.statusCode).toBe(201)
    const d = r.json()
    expect(d).toMatchObject({ status: 'emitido', tipo: 'nfce', valor_total_centavos: 3500, tentativas: 1 })
    expect(d.chave).toMatch(/^[0-9]{44}$/)
    expect(d.link.startsWith('https://')).toBe(true)
    expect(emissor.chamadas).toHaveLength(1)
    expect(emissor.chamadas[0]!.emitente.credencial.revelar()).toBe(SEGREDO)
    expect(emissor.chamadas[0]!.pedido.itens[0]!.valorTotalCentavos).toBe(3500)
    expect(r.body).not.toContain(SEGREDO)

    const lista = await app.inject({ method: 'GET', url: '/v1/fiscal/documentos?status=emitido', headers: hdr(f) })
    expect(lista.json().itens).toHaveLength(1)
    const det = await app.inject({ method: 'GET', url: `/v1/fiscal/documentos/${d.id}`, headers: hdr(f) })
    expect(det.statusCode).toBe(200)
    await app.close()
  })

  it('e idempotente: segunda emissao do mesmo pedido+tipo da 409 e nao chama o emissor', async () => {
    if (!disponivel) return
    const emissor = new FakeClienteFiscal()
    const { f, app } = await comConfig(emissor)
    const pid = await pedido(f.lojaId)
    const body = { pedido_id: pid, tipo: 'nfce' }
    await app.inject({ method: 'POST', url: '/v1/fiscal/documentos', headers: hdr(f), payload: body })
    const dup = await app.inject({ method: 'POST', url: '/v1/fiscal/documentos', headers: hdr(f), payload: body })
    expect(dup.statusCode).toBe(409)
    expect(dup.json().error.code).toBe('documento_ja_existe')
    expect(emissor.chamadas).toHaveLength(1)
    // outro tipo no mesmo pedido e permitido
    const nfse = await app.inject({ method: 'POST', url: '/v1/fiscal/documentos', headers: hdr(f), payload: { pedido_id: pid, tipo: 'nfse' } })
    expect(nfse.statusCode).toBe(201)
    await app.close()
  })

  it('falha do emissor vira documento erro (sem msg crua); retry reaproveita a linha', async () => {
    if (!disponivel) return
    const emissor = new FakeClienteFiscal().falharSempre(new Transitorio('detalhe interno do provedor com segredo', { codigo: 'timeout' }))
    const { f, app } = await comConfig(emissor)
    const pid = await pedido(f.lojaId)
    const body = { pedido_id: pid, tipo: 'nfce' }
    const r1 = await app.inject({ method: 'POST', url: '/v1/fiscal/documentos', headers: hdr(f), payload: body })
    expect(r1.statusCode).toBe(201)
    expect(r1.json()).toMatchObject({ status: 'erro', erro: 'emissor: timeout', chave: null })
    expect(r1.body).not.toContain('detalhe interno')

    emissor.falharSempre(undefined)
    const r2 = await app.inject({ method: 'POST', url: '/v1/fiscal/documentos', headers: hdr(f), payload: body })
    expect(r2.json()).toMatchObject({ status: 'emitido', tentativas: 2, erro: null, id: r1.json().id })
    await app.close()
  })

  it('rejeicao de negocio do emissor fica erro com motivo; link nao-https e descartado', async () => {
    if (!disponivel) return
    const rej = new FakeClienteFiscal({ resposta: { status: 'erro', chave: null, link: null, erro: 'CNPJ invalido' } })
    const { f, app } = await comConfig(rej)
    const pid = await pedido(f.lojaId)
    const r = await app.inject({ method: 'POST', url: '/v1/fiscal/documentos', headers: hdr(f), payload: { pedido_id: pid, tipo: 'nfce' } })
    expect(r.json()).toMatchObject({ status: 'erro', erro: 'CNPJ invalido' })

    const http = new FakeClienteFiscal({ resposta: { status: 'emitido', chave: 'abc123', link: 'http://inseguro.exemplo/x', erro: null } })
    const c2 = await comConfig(http)
    const pid2 = await pedido(c2.f.lojaId)
    const r2 = await c2.app.inject({ method: 'POST', url: '/v1/fiscal/documentos', headers: hdr(c2.f), payload: { pedido_id: pid2, tipo: 'nfce' } })
    expect(r2.json()).toMatchObject({ status: 'emitido', link: null, chave: 'abc123' })
    await app.close()
    await c2.app.close()
  })

  it('regras: sem config 422; rascunho 422; sem itens 422; pedido de outra loja 404', async () => {
    if (!disponivel) return
    const semCfg = await seed('dono')
    const appA = await montarApp({ cifra, emissor: new FakeClienteFiscal() })
    const p0 = await pedido(semCfg.lojaId)
    const r0 = await appA.inject({ method: 'POST', url: '/v1/fiscal/documentos', headers: hdr(semCfg), payload: { pedido_id: p0, tipo: 'nfce' } })
    expect(r0.statusCode).toBe(422)
    expect(r0.json().error.code).toBe('fiscal_nao_configurado')

    const { f, app } = await comConfig(new FakeClienteFiscal())
    const post = (pedido_id: string, h = hdr(f)) =>
      app.inject({ method: 'POST', url: '/v1/fiscal/documentos', headers: h, payload: { pedido_id, tipo: 'nfce' } })
    expect((await post(await pedido(f.lojaId, 'rascunho'))).json().error.code).toBe('pedido_nao_emissivel')
    expect((await post(await pedido(f.lojaId, 'novo', false))).json().error.code).toBe('pedido_sem_itens')
    // pedido da OUTRA loja da mesma conta: nao e visivel pelo escopo da loja ativa
    expect((await post(await pedido(f.outraLojaId))).statusCode).toBe(404)
    await appA.close()
    await app.close()
  })

  it('isolamento: documento de uma loja nao aparece para outra', async () => {
    if (!disponivel) return
    const { f, app } = await comConfig(new FakeClienteFiscal())
    const pid = await pedido(f.lojaId)
    const r = await app.inject({ method: 'POST', url: '/v1/fiscal/documentos', headers: hdr(f), payload: { pedido_id: pid, tipo: 'nfce' } })
    const outro = await seed('dono')
    const det = await app.inject({ method: 'GET', url: `/v1/fiscal/documentos/${r.json().id}`, headers: hdr(outro) })
    expect(det.statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/v1/fiscal/documentos', headers: hdr(outro) })).json().itens).toHaveLength(0)
    await app.close()
  })
})

describe('dado fiscal por item', () => {
  async function comConfig(emissor: FakeClienteFiscal) {
    const f = await seed('dono')
    const app = await montarApp({ cifra, emissor })
    await poolSuper.query(
      `insert into public.fiscal_config (loja_id, credencial_cifrada, ultimos4, cnpj, regime)
       values ($1,$2,'6789','12345678000195','simples_nacional')`,
      [f.lojaId, cifra.cifrar(SEGREDO)],
    )
    return { f, app }
  }

  it('NFC-e com item sem dado fiscal nao emite: barra com 422 e nomeia o item', async () => {
    if (!disponivel) return
    const emissor = new FakeClienteFiscal()
    const { f, app } = await comConfig(emissor)
    const pid = await pedido(f.lojaId, 'entregue', true, false) // item sem itens_fiscais
    const r = await app.inject({ method: 'POST', url: '/v1/fiscal/documentos', headers: hdr(f), payload: { pedido_id: pid, tipo: 'nfce' } })
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('itens_sem_dado_fiscal')
    expect(r.json().error.message).toContain('Pizza')
    // Nao chamou o emissor nem reservou documento (barrado antes).
    expect(emissor.chamadas).toHaveLength(0)
    expect((await app.inject({ method: 'GET', url: '/v1/fiscal/documentos', headers: hdr(f) })).json().itens).toHaveLength(0)
    // NFS-e nao exige dado por item: emite normalmente.
    const nfse = await app.inject({ method: 'POST', url: '/v1/fiscal/documentos', headers: hdr(f), payload: { pedido_id: pid, tipo: 'nfse' } })
    expect(nfse.statusCode).toBe(201)
    expect(nfse.json().status).toBe('emitido')
    await app.close()
  })

  it('a emissao de NFC-e repassa o item COM NCM/CFOP/CSOSN e origem ao emissor', async () => {
    if (!disponivel) return
    const emissor = new FakeClienteFiscal()
    const { f, app } = await comConfig(emissor)
    const pid = await pedido(f.lojaId, 'entregue', true, true)
    const r = await app.inject({ method: 'POST', url: '/v1/fiscal/documentos', headers: hdr(f), payload: { pedido_id: pid, tipo: 'nfce' } })
    expect(r.statusCode).toBe(201)
    const item = emissor.chamadas[0]!.pedido.itens[0]!
    expect(item).toMatchObject({ ncm: '21069090', cfop: '5102', origem: 0, unidade: 'UN', situacaoTributaria: '102' })
    await app.close()
  })

  it('GET /itens lista itens com o dado fiscal e flag completo; PUT /itens/:id faz upsert', async () => {
    if (!disponivel) return
    const { f, app } = await comConfig(new FakeClienteFiscal())
    const semFiscal = await itemCatalogo(f.lojaId, false)
    const lista0 = await app.inject({ method: 'GET', url: '/v1/fiscal/itens', headers: hdr(f) })
    expect(lista0.statusCode).toBe(200)
    const linha0 = lista0.json().itens.find((i: { item_id: string }) => i.item_id === semFiscal)
    expect(linha0).toMatchObject({ nome: 'Pizza', categoria_nome: 'Pizzas', completo: false, ncm: null })

    const put = await app.inject({
      method: 'PUT', url: `/v1/fiscal/itens/${semFiscal}`, headers: hdr(f),
      payload: { ncm: '21069090', cfop: '5102', origem: 0, unidade: 'UN', csosn: '102' },
    })
    expect(put.statusCode).toBe(200)
    expect(put.json()).toMatchObject({ item_id: semFiscal, ncm: '21069090', completo: true })
    // idempotente: segundo PUT atualiza (sem erro de unique)
    const put2 = await app.inject({
      method: 'PUT', url: `/v1/fiscal/itens/${semFiscal}`, headers: hdr(f),
      payload: { ncm: '19059090', cfop: '5102', origem: 0, unidade: 'UN', csosn: '102' },
    })
    expect(put2.json().ncm).toBe('19059090')

    // item de outra loja: 404 (escopo)
    const outraItem = await itemCatalogo(f.outraLojaId, false)
    const alheio = await app.inject({
      method: 'PUT', url: `/v1/fiscal/itens/${outraItem}`, headers: hdr(f),
      payload: { ncm: '21069090', cfop: '5102', origem: 0, unidade: 'UN', csosn: '102' },
    })
    expect(alheio.statusCode).toBe(404)
    await app.close()
  })

  it('dado fiscal e isolado por loja (nao vaza entre lojas)', async () => {
    if (!disponivel) return
    const { f, app } = await comConfig(new FakeClienteFiscal())
    await itemCatalogo(f.lojaId, true)
    const outro = await seed('dono')
    const appOutro = await montarApp({ cifra, emissor: new FakeClienteFiscal() })
    const lista = await appOutro.inject({ method: 'GET', url: '/v1/fiscal/itens', headers: hdr(outro) })
    expect(lista.json().itens).toHaveLength(0)
    await app.close()
    await appOutro.close()
  })
})

describe('pedidos elegiveis e emissao automatica', () => {
  async function comConfig(emissor: FakeClienteFiscal, auto: boolean) {
    const f = await seed('dono')
    const app = await montarApp({ cifra, emissor })
    await poolSuper.query(
      `insert into public.fiscal_config (loja_id, credencial_cifrada, ultimos4, cnpj, regime, auto_emitir)
       values ($1,$2,'6789','12345678000195','simples_nacional',$3)`,
      [f.lojaId, cifra.cifrar(SEGREDO), auto],
    )
    return { f, app }
  }

  it('GET /pedidos-emissiveis lista so os concluidos sem NFC-e', async () => {
    if (!disponivel) return
    const { f, app } = await comConfig(new FakeClienteFiscal(), false)
    const entregue = await pedido(f.lojaId, 'entregue', true, true)
    await pedido(f.lojaId, 'em_preparo', true, true) // nao concluido: fora
    const lista = await app.inject({ method: 'GET', url: '/v1/fiscal/pedidos-emissiveis', headers: hdr(f) })
    expect(lista.statusCode).toBe(200)
    const ids = lista.json().itens.map((p: { pedido_id: string }) => p.pedido_id)
    expect(ids).toContain(entregue)
    expect(ids).toHaveLength(1)
    await app.close()
  })

  it('POST /documentos/auto emite os concluidos, e idempotente e so com auto ligado', async () => {
    if (!disponivel) return
    const emissor = new FakeClienteFiscal()
    const { f, app } = await comConfig(emissor, true)
    const p1 = await pedido(f.lojaId, 'entregue', true, true)
    await pedido(f.lojaId, 'entregue', true, false) // sem dado fiscal: pulado, nao derruba o lote
    const r = await app.inject({ method: 'POST', url: '/v1/fiscal/documentos/auto', headers: hdr(f) })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ emitidos: 1, pulados: 1 })
    // segunda passada: o p1 ja tem documento, nada novo a emitir
    const r2 = await app.inject({ method: 'POST', url: '/v1/fiscal/documentos/auto', headers: hdr(f) })
    expect(r2.json().emitidos).toBe(0)
    const docs = await app.inject({ method: 'GET', url: '/v1/fiscal/documentos?status=emitido', headers: hdr(f) })
    expect(docs.json().itens.map((d: { pedido_id: string }) => d.pedido_id)).toContain(p1)
    await app.close()
  })

  it('auto desligado: 422 auto_emissao_desligada', async () => {
    if (!disponivel) return
    const { f, app } = await comConfig(new FakeClienteFiscal(), false)
    await pedido(f.lojaId, 'entregue', true, true)
    const r = await app.inject({ method: 'POST', url: '/v1/fiscal/documentos/auto', headers: hdr(f) })
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('auto_emissao_desligada')
    await app.close()
  })
})

describe('privilegios do banco', () => {
  it('api nao tem DELETE em fiscal_config nem em documentos_fiscais', async () => {
    if (!disponivel) return
    await expect(poolApi.query('delete from public.fiscal_config')).rejects.toThrow()
    await expect(poolApi.query('delete from public.documentos_fiscais')).rejects.toThrow()
  })
})

describe('stub de producao', () => {
  it('emissorNaoConfigurado devolve erro Permanente tipado', async () => {
    const { emissorNaoConfigurado } = await import('./config')
    const r = await emissorNaoConfigurado.emitir({} as never)
    expect(r).toEqual(falha(expect.objectContaining({ codigo: 'emissor_nao_configurado' })))
  })
})
