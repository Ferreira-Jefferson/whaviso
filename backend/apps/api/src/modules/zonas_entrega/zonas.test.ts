// Zonas de entrega: CRUD, validacao por tipo, resolver (desempate), lote, impacto e seguranca
// (SEC-001/002/030/080/081). Roda no Postgres LOCAL whaviso_dev com a app real; se offline, pula.
import type { InjectOptions } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { zonasEntregaRoutes } from './routes'

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[zonas_entrega] banco inacessivel: integracao PULADA.')

const quadrado = {
  type: 'Polygon',
  coordinates: [
    [
      [-46.7, -23.6],
      [-46.5, -23.6],
      [-46.5, -23.4],
      [-46.7, -23.4],
      [-46.7, -23.6],
    ],
  ],
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- corpo JSON livre nos testes
type Resp = { status: number; corpo: any; body: string }

d('zonas_entrega', () => {
  const cenario = novoCenario()
  let app: Awaited<ReturnType<typeof construirApp>>
  let lojaA = ''
  let lojaB = ''
  let dono = ''
  let gerente = ''
  let atendente = ''
  let donoB = ''

  const chamar = async (user: string, loja: string, metodo: NonNullable<InjectOptions['method']>, url: string, corpo?: unknown): Promise<Resp> => {
    const res = await app.inject({
      method: metodo,
      url: `/v1/zonas${url}`,
      headers: { authorization: `Bearer ${user}`, 'x-loja-id': loja },
      ...(corpo === undefined ? {} : { payload: corpo as object }),
    })
    return { status: res.statusCode, corpo: res.body ? res.json() : null, body: res.body }
  }
  const bairro = (nome: string, taxa = 500, extra: object = {}) => ({
    tipo: 'bairro', nome, bairro: nome, taxa_cliente_centavos: taxa, valor_motoboy_centavos: 300, ...extra,
  })

  beforeAll(async () => {
    const env = envSchema.parse({
      DATABASE_URL: 'postgres://ignorado',
      SUPABASE_URL: 'https://exemplo.supabase.co',
      APP_URL: 'http://localhost:5173',
      RATE_LIMIT_MAX: '100000',
    })
    dono = await criarUsuario(cenario)
    gerente = await criarUsuario(cenario)
    atendente = await criarUsuario(cenario)
    donoB = await criarUsuario(cenario)
    const contaA = await criarConta(cenario, dono)
    const contaB = await criarConta(cenario, donoB)
    lojaA = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    await criarMembro(contaA, dono, 'dono', null)
    await criarMembro(contaA, gerente, 'gerente', lojaA)
    await criarMembro(contaA, atendente, 'atendente', lojaA)
    await criarMembro(contaB, donoB, 'dono', null)
    app = await construirApp({
      env, pool: poolApi, logger: false, verificador: verificadorFake,
      modulos: [{ prefixo: 'zonas', plugin: zonasEntregaRoutes }],
    })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
    await limpar(cenario)
    await fecharPools()
  })

  describe('CRUD e papeis', () => {
    it('cria zona de bairro com minimo e frete gratis; devolve centavos e impacto zero', async () => {
      const r = await chamar(dono, lojaA, 'POST', '', bairro('Centro', 700, { pedido_minimo_centavos: 2500, frete_gratis_acima_centavos: 8000 }))
      expect(r.status).toBe(201)
      expect(r.corpo).toMatchObject({
        nome: 'Centro', tipo: 'bairro', bairro: 'Centro', area: null, taxa_cliente_centavos: 700,
        valor_motoboy_centavos: 300, pedido_minimo_centavos: 2500, frete_gratis_acima_centavos: 8000,
        ativo: true, pedidos_em_aberto: 0,
      })
    })

    it('minimo e frete gratis sao opcionais (null)', async () => {
      const r = await chamar(gerente, lojaA, 'POST', '', bairro('Sem Regra'))
      expect(r.status).toBe(201)
      expect(r.corpo.pedido_minimo_centavos).toBeNull()
      expect(r.corpo.frete_gratis_acima_centavos).toBeNull()
    })

    it('cria poligono e raio; area gravada e devolvida pelo contrato', async () => {
      const p = await chamar(dono, lojaA, 'POST', '', { tipo: 'poligono', nome: 'Poli', area: quadrado, taxa_cliente_centavos: 900, valor_motoboy_centavos: 400 })
      expect(p.status).toBe(201)
      expect(p.corpo.area).toEqual(quadrado)
      const r = await chamar(dono, lojaA, 'POST', '', { tipo: 'raio', nome: 'Raio', centro: { lat: -23.5, lng: -46.6 }, metros: 3000, taxa_cliente_centavos: 1200, valor_motoboy_centavos: 500 })
      expect(r.status).toBe(201)
      expect(r.corpo.area).toEqual({ centro: { lat: -23.5, lng: -46.6 }, metros: 3000 })
    })

    it('atendente le (lista, detalhe) mas nao escreve (403)', async () => {
      expect((await chamar(atendente, lojaA, 'GET', '')).status).toBe(200)
      const lista = (await chamar(atendente, lojaA, 'GET', '')).corpo.itens as { id: string }[]
      expect((await chamar(atendente, lojaA, 'GET', `/${lista[0]!.id}`)).status).toBe(200)
      expect((await chamar(atendente, lojaA, 'POST', '', bairro('X'))).status).toBe(403)
      expect((await chamar(atendente, lojaA, 'PATCH', `/${lista[0]!.id}`, { nome: 'Y' })).status).toBe(403)
      expect((await chamar(atendente, lojaA, 'POST', `/${lista[0]!.id}/desativar`)).status).toBe(403)
      expect((await chamar(atendente, lojaA, 'POST', '/lote', { bairros: ['A'], taxa_cliente_centavos: 1, valor_motoboy_centavos: 1 })).status).toBe(403)
    })

    it('PATCH parcial: altera valores e limpa frete gratis com null', async () => {
      const z = (await chamar(dono, lojaA, 'POST', '', bairro('Patch', 100, { frete_gratis_acima_centavos: 5000 }))).corpo
      const r = await chamar(gerente, lojaA, 'PATCH', `/${z.id}`, { taxa_cliente_centavos: 650, frete_gratis_acima_centavos: null })
      expect(r.status).toBe(200)
      expect(r.corpo).toMatchObject({ taxa_cliente_centavos: 650, frete_gratis_acima_centavos: null, nome: 'Patch' })
    })

    it('PATCH com campo incompativel com o tipo e 422', async () => {
      const raio = (await chamar(dono, lojaA, 'POST', '', { tipo: 'raio', nome: 'R2', centro: { lat: 0, lng: 0 }, metros: 10, taxa_cliente_centavos: 1, valor_motoboy_centavos: 1 })).corpo
      const a = await chamar(dono, lojaA, 'PATCH', `/${raio.id}`, { bairro: 'Algum' })
      expect(a.status).toBe(422)
      expect(a.corpo.error.code).toBe('campo_incompativel_com_tipo')
      const b = await chamar(dono, lojaA, 'PATCH', `/${raio.id}`, { area: quadrado })
      expect(b.status).toBe(422)
      const c = await chamar(dono, lojaA, 'PATCH', `/${raio.id}`, { area: { centro: { lat: 1, lng: 1 }, metros: 50 } })
      expect(c.status).toBe(200)
      expect(c.corpo.area).toEqual({ centro: { lat: 1, lng: 1 }, metros: 50 })
    })

    it('desativar some da lista padrao, aparece com incluir_inativas e pode reativar; repetir e 409', async () => {
      const z = (await chamar(dono, lojaA, 'POST', '', bairro('Ciclo'))).corpo
      const off = await chamar(dono, lojaA, 'POST', `/${z.id}/desativar`)
      expect(off.corpo.ativo).toBe(false)
      expect((await chamar(dono, lojaA, 'POST', `/${z.id}/desativar`)).status).toBe(409)
      const padrao = (await chamar(dono, lojaA, 'GET', '')).corpo.itens as { id: string }[]
      expect(padrao.find((x) => x.id === z.id)).toBeUndefined()
      const todas = (await chamar(dono, lojaA, 'GET', '?incluir_inativas=true')).corpo.itens as { id: string }[]
      expect(todas.find((x) => x.id === z.id)).toBeDefined()
      const on = await chamar(dono, lojaA, 'POST', `/${z.id}/ativar`)
      expect(on.corpo.ativo).toBe(true)
      expect((await chamar(dono, lojaA, 'POST', `/${z.id}/ativar`)).status).toBe(409)
    })
  })

  describe('validacao (400 shape)', () => {
    const base = { taxa_cliente_centavos: 100, valor_motoboy_centavos: 100 }
    const casos: [string, unknown][] = [
      ['tipo desconhecido', { tipo: 'cidade', nome: 'X', ...base }],
      ['bairro sem bairro', { tipo: 'bairro', nome: 'X', ...base }],
      ['poligono sem area', { tipo: 'poligono', nome: 'X', ...base }],
      ['raio sem metros', { tipo: 'raio', nome: 'X', centro: { lat: 0, lng: 0 }, ...base }],
      ['raio zero', { tipo: 'raio', nome: 'X', centro: { lat: 0, lng: 0 }, metros: 0, ...base }],
      ['raio gigante', { tipo: 'raio', nome: 'X', centro: { lat: 0, lng: 0 }, metros: 1_000_000, ...base }],
      ['lat invalida', { tipo: 'raio', nome: 'X', centro: { lat: 91, lng: 0 }, metros: 10, ...base }],
      ['taxa negativa', bairro('X', -1)],
      ['taxa fracionada', bairro('X', 10.5)],
      ['minimo negativo', bairro('X', 100, { pedido_minimo_centavos: -5 })],
      ['frete gratis fracionado', bairro('X', 100, { frete_gratis_acima_centavos: 1.5 })],
      ['nome gigante', bairro('x'.repeat(81))],
      ['poligono nao fechado', { tipo: 'poligono', nome: 'X', area: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] }, ...base }],
      ['poligono com 3 pontos', { tipo: 'poligono', nome: 'X', area: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]]] }, ...base }],
      ['poligono gigante', { tipo: 'poligono', nome: 'X', area: { type: 'Polygon', coordinates: [[...Array.from({ length: 300 }, (_, i) => [i / 1000, i / 1000]), [0, 0]]] }, ...base }],
      ['geojson de outro tipo', { tipo: 'poligono', nome: 'X', area: { type: 'Point', coordinates: [0, 0] }, ...base }],
      ['chave extra', bairro('X', 100, { admin: true })],
    ]
    for (const [nome, corpo] of casos) {
      it(`rejeita: ${nome}`, async () => {
        const r = await chamar(dono, lojaA, 'POST', '', corpo)
        expect(r.status).toBe(400)
        expect(r.corpo.error.code).toBe('entrada_invalida')
      })
    }
    it('PATCH vazio e lote vazio/gigante sao 400', async () => {
      const z = (await chamar(dono, lojaA, 'POST', '', bairro('Vazio'))).corpo
      expect((await chamar(dono, lojaA, 'PATCH', `/${z.id}`, {})).status).toBe(400)
      expect((await chamar(dono, lojaA, 'POST', '/lote', { bairros: [], ...base })).status).toBe(400)
      expect((await chamar(dono, lojaA, 'POST', '/lote', { bairros: Array.from({ length: 201 }, (_, i) => `b${i}`), ...base })).status).toBe(400)
    })
  })

  describe('bairro: normalizacao e unicidade', () => {
    it('duplicata com acento/caixa/espaco entre ativas e 409; desativada libera o nome', async () => {
      const a = await chamar(dono, lojaA, 'POST', '', bairro('Sao Joao'))
      expect(a.status).toBe(201)
      const dup = await chamar(dono, lojaA, 'POST', '', bairro('  SÃO   joão '))
      expect(dup.status).toBe(409)
      expect(dup.corpo.error.code).toBe('bairro_duplicado')
      await chamar(dono, lojaA, 'POST', `/${a.corpo.id}/desativar`)
      expect((await chamar(dono, lojaA, 'POST', '', bairro('São João'))).status).toBe(201)
      // reativar a antiga agora colide com a nova ativa
      expect((await chamar(dono, lojaA, 'POST', `/${a.corpo.id}/ativar`)).status).toBe(409)
    })

    it('PATCH de bairro para um ja existente e 409; o mesmo nome em outra loja e livre', async () => {
      const x = (await chamar(dono, lojaA, 'POST', '', bairro('Bairro X'))).corpo
      await chamar(dono, lojaA, 'POST', '', bairro('Bairro Y'))
      const r = await chamar(dono, lojaA, 'PATCH', `/${x.id}`, { bairro: 'bairro y' })
      expect(r.status).toBe(409)
      expect((await chamar(donoB, lojaB, 'POST', '', bairro('Bairro X'))).status).toBe(201)
    })
  })

  describe('lote de bairros', () => {
    it('cria todos com valores padrao', async () => {
      const r = await chamar(dono, lojaA, 'POST', '/lote', {
        bairros: ['Lote Um', 'Lote Dois', 'Lote Tres'], taxa_cliente_centavos: 400, valor_motoboy_centavos: 250, pedido_minimo_centavos: 2000,
      })
      expect(r.status).toBe(201)
      expect(r.corpo.itens).toHaveLength(3)
      expect(r.corpo.itens[0]).toMatchObject({ tipo: 'bairro', taxa_cliente_centavos: 400, pedido_minimo_centavos: 2000, frete_gratis_acima_centavos: null })
    })

    it('rejeita o lote inteiro com duplicata (interna ou contra existente), sem criar nada', async () => {
      const interna = await chamar(dono, lojaA, 'POST', '/lote', { bairros: ['Novo A', 'novo a'], taxa_cliente_centavos: 1, valor_motoboy_centavos: 1 })
      expect(interna.status).toBe(409)
      const existente = await chamar(dono, lojaA, 'POST', '/lote', { bairros: ['Novo B', 'Lote Um'], taxa_cliente_centavos: 1, valor_motoboy_centavos: 1 })
      expect(existente.status).toBe(409)
      const nomes = ((await chamar(dono, lojaA, 'GET', '')).corpo.itens as { bairro: string | null }[]).map((z) => z.bairro)
      expect(nomes).not.toContain('Novo A')
      expect(nomes).not.toContain('Novo B')
    })
  })

  describe('resolver', () => {
    it('bairro com acento/caixa diferente casa e devolve os dois valores', async () => {
      await chamar(dono, lojaA, 'POST', '', bairro('Vila Madalena', 800, { pedido_minimo_centavos: 3000 }))
      const r = await chamar(atendente, lojaA, 'POST', '/resolver', { bairro: 'VILA   MADALENA' })
      expect(r.status).toBe(200)
      expect(r.corpo).toMatchObject({ fora_da_area: false, nome: 'Vila Madalena', taxa_cliente_centavos: 800, valor_motoboy_centavos: 300, pedido_minimo_centavos: 3000 })
      const sem = await chamar(atendente, lojaA, 'POST', '/resolver', { bairro: 'Vila Madalená' })
      expect(sem.corpo.fora_da_area).toBe(false)
    })

    it('fora da area: 200 com fora_da_area true, sem erro', async () => {
      const r = await chamar(dono, lojaA, 'POST', '/resolver', { bairro: 'Planeta Marte' })
      expect(r.status).toBe(200)
      expect(r.corpo).toEqual({ fora_da_area: true })
    })

    it('ponto em poligono e em raio; poligono vence raio mesmo com taxa maior', async () => {
      // Ponto dentro do poligono "Poli" (taxa 900) e do raio "Raio" (taxa 1200).
      const r = await chamar(dono, lojaA, 'POST', '/resolver', { lat: -23.5, lng: -46.6 })
      expect(r.corpo).toMatchObject({ fora_da_area: false, nome: 'Poli', taxa_cliente_centavos: 900 })
      // Fora do poligono, dentro do raio de 3 km de (-23.5,-46.6)? (-23.5, -46.45) esta a ~15 km: fora.
      const longe = await chamar(dono, lojaA, 'POST', '/resolver', { lat: -23.5, lng: -46.45 })
      expect(longe.corpo.fora_da_area).toBe(true)
    })

    it('bairro exato vence poligono contendo o ponto', async () => {
      const r = await chamar(dono, lojaA, 'POST', '/resolver', { bairro: 'Vila Madalena', lat: -23.5, lng: -46.6 })
      expect(r.corpo.nome).toBe('Vila Madalena')
    })

    it('empate: menor taxa do cliente, depois a mais antiga', async () => {
      const raio = (nome: string, taxa: number) => ({ tipo: 'raio', nome, centro: { lat: 10, lng: 10 }, metros: 5000, taxa_cliente_centavos: taxa, valor_motoboy_centavos: 1 })
      expect((await chamar(donoB, lojaB, 'POST', '', raio('Cara', 900))).status).toBe(201)
      expect((await chamar(donoB, lojaB, 'POST', '', raio('Barata', 300))).status).toBe(201)
      await chamar(donoB, lojaB, 'POST', '', raio('Barata Nova', 300))
      const r = await chamar(donoB, lojaB, 'POST', '/resolver', { lat: 10, lng: 10 })
      expect(r.corpo.nome).toBe('Barata')
    })

    it('desativada some do resolver', async () => {
      const z = (await chamar(dono, lojaA, 'POST', '', bairro('Efemero'))).corpo
      expect((await chamar(dono, lojaA, 'POST', '/resolver', { bairro: 'Efemero' })).corpo.fora_da_area).toBe(false)
      await chamar(dono, lojaA, 'POST', `/${z.id}/desativar`)
      expect((await chamar(dono, lojaA, 'POST', '/resolver', { bairro: 'Efemero' })).corpo.fora_da_area).toBe(true)
    })

    it('entrada sem bairro nem coordenadas, ou so lat, e 400', async () => {
      expect((await chamar(dono, lojaA, 'POST', '/resolver', {})).status).toBe(400)
      expect((await chamar(dono, lojaA, 'POST', '/resolver', { lat: 1 })).status).toBe(400)
    })
  })

  describe('impacto', () => {
    it('conta so pedidos em aberto da zona (entregue nao conta); desativar nao bloqueia', async () => {
      const z = (await chamar(dono, lojaA, 'POST', '', bairro('Impacto'))).corpo
      const ins = (codigo: string, status: string) =>
        poolSuper.query(
          `insert into public.pedidos (loja_id, codigo, status, subtotal_centavos, total_centavos, zona_id)
           values ($1, $2, $3::status_pedido, 1000, 1000, $4)`,
          [lojaA, codigo, status, z.id],
        )
      await ins('Z1', 'novo')
      await ins('Z2', 'em_preparo')
      await ins('Z3', 'entregue')
      expect((await chamar(dono, lojaA, 'GET', `/${z.id}`)).corpo.pedidos_em_aberto).toBe(2)
      const off = await chamar(dono, lojaA, 'POST', `/${z.id}/desativar`)
      expect(off.status).toBe(200)
      expect(off.corpo.pedidos_em_aberto).toBe(2)
    })
  })

  describe('seguranca', () => {
    it('SEC-001: sem token 401; loja de outra conta no header 404', async () => {
      expect((await app.inject({ method: 'GET', url: '/v1/zonas' })).statusCode).toBe(401)
      expect((await chamar(donoB, lojaA, 'GET', '')).status).toBe(404)
    })

    it('SEC-001: zona da loja A inacessivel e imutavel pela loja B', async () => {
      const z = (await chamar(dono, lojaA, 'POST', '', bairro('So da A'))).corpo
      const listaB = (await chamar(donoB, lojaB, 'GET', '?incluir_inativas=true')).corpo.itens as { id: string }[]
      expect(listaB.find((x) => x.id === z.id)).toBeUndefined()
      for (const [m, u, c] of [
        ['GET', `/${z.id}`, undefined],
        ['PATCH', `/${z.id}`, { nome: 'hack' }],
        ['POST', `/${z.id}/desativar`, undefined],
        ['POST', `/${z.id}/ativar`, undefined],
      ] as const) {
        expect((await chamar(donoB, lojaB, m, u, c)).status, `${m} ${u}`).toBe(404)
      }
      expect((await chamar(donoB, lojaB, 'POST', '/resolver', { bairro: 'So da A' })).corpo.fora_da_area).toBe(true)
      const { rows } = await poolSuper.query('select nome, ativo from public.zonas_entrega where id = $1', [z.id])
      expect(rows[0]).toMatchObject({ nome: 'So da A', ativo: true })
    })

    it('SEC-002: loja_id no corpo e rejeitado (400) e nunca usado', async () => {
      const r = await chamar(dono, lojaA, 'POST', '', { ...bairro('Forjada'), loja_id: lojaB })
      expect(r.status).toBe(400)
      const { rows } = await poolSuper.query("select 1 from public.zonas_entrega where loja_id = $1 and nome = 'Forjada'", [lojaB])
      expect(rows).toHaveLength(0)
    })

    it('id nao uuid e 400', async () => {
      expect((await chamar(dono, lojaA, 'GET', '/nao-uuid')).status).toBe(400)
    })

    it('SEC-030: whaviso_api sem DELETE; atendente so SELECT (grants reais do banco)', async () => {
      await expect(poolApi.query('delete from public.zonas_entrega where false')).rejects.toThrow(/permission denied|permiss.o negada/i)
      const c = await poolSuper.connect()
      try {
        await c.query('begin')
        await c.query('set local role whaviso_atendente')
        await c.query('select id from public.zonas_entrega limit 1')
        await expect(
          c.query("update public.zonas_entrega set nome = 'x' where false"),
        ).rejects.toThrow(/permission denied|permiss.o negada/i)
      } finally {
        await c.query('rollback').catch(() => {})
        c.release()
      }
    })

    it('eventos de auditoria sem PII: so ids, user_id, tipo e nomes de campos', async () => {
      const z = (await chamar(dono, lojaA, 'POST', '', bairro('Auditada'))).corpo
      await chamar(dono, lojaA, 'PATCH', `/${z.id}`, { taxa_cliente_centavos: 1 })
      const { rows } = await poolSuper.query<{ tipo: string; detalhes: Record<string, unknown> }>(
        "select tipo, detalhes from public.eventos where entidade = 'zona' and entidade_id = $1 order by id", [z.id],
      )
      expect(rows.map((r) => r.tipo)).toEqual(['zona.criada', 'zona.atualizada'])
      expect(rows[1]!.detalhes).toEqual({ user_id: dono, campos: ['taxa_cliente_centavos'] })
    })
  })
})
