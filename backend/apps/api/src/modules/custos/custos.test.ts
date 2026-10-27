// Integracao do modulo custos contra o Postgres local (se PULA sem banco): isolamento por loja,
// agregado do operador sem conteudo, append-only, grants por role, idempotencia, periodo e
// paginacao. Usa dias fixos no futuro (2031) para isolar os numeros do resto do banco de teste.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Writable } from 'node:stream'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarOperador, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper, type Cenario,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { custosRoutes } from './routes'
import { registrarEventoCusto } from './service'

const online = await bancoAcessivel()
const d = online ? describe : describe.skip

// ---- Guarda estatica (sem banco) ---------------------------------------------------------------

describe('custos: guarda estatica', () => {
  const fontes = readdirSync(__dirname)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => ({ arquivo: f, texto: readFileSync(join(__dirname, f), 'utf8') }))

  it('SQL do modulo nao cita tabela de conteudo nem usa select *', () => {
    const proibidas = ['pedidos', 'itens_pedido', 'conversas', 'mensagens', 'clientes', 'enderecos', 'credenciais_llm', 'envios']
    for (const { arquivo, texto } of fontes) {
      for (const t of proibidas) {
        expect(new RegExp(`(from|join|into|update)\\s+(public\\.)?${t}\\b`, 'i').test(texto), `${arquivo} cita ${t}`).toBe(false)
      }
      expect(/select\s+\*\s+from/i.test(texto), `${arquivo} usa select *`).toBe(false)
    }
  })

  it('migration 0047 nao tem coluna de conteudo em eventos_custo e nao concede DELETE/UPDATE', () => {
    const sqlTxt = readFileSync(resolve(__dirname, '../../../../../supabase/migrations/0047_custos.sql'), 'utf8')
    const tabela = /create table public\.eventos_custo \(([\s\S]*?)\n\);/.exec(sqlTxt)![1]!
    const colunas = tabela.split('\n').map((l) => l.trim().split(/\s+/)[0]!)
    for (const proibida of ['conteudo', 'texto', 'mensagem', 'prompt', 'resposta', 'telefone', 'corpo', 'payload']) {
      expect(colunas).not.toContain(proibida)
    }
    expect(/grant[^;]*\b(delete|update)\b/i.test(sqlTxt)).toBe(false)
  })
})

// ---- Integracao -------------------------------------------------------------------------------

const DIA_A = '2031-03-10'
const DIA_B = '2031-03-11'
const noDia = (dia: string, hora = '15:00:00') => `${dia} ${hora}-03`

type App = Awaited<ReturnType<typeof construirApp>>

d('modulo custos', () => {
  const cenario: Cenario = novoCenario()
  const logs: string[] = []
  let app: App
  let donoA: string
  let atendenteA: string
  let operador: string
  let lojaA: string
  let lojaB: string

  async function get(user: string | undefined, url: string, loja?: string) {
    const headers: Record<string, string> = {}
    if (user) headers.authorization = `Bearer ${user}`
    if (loja) headers['x-loja-id'] = loja
    const res = await app.inject({ method: 'GET', url: `/v1/custos${url}`, headers })
    return { status: res.statusCode, corpo: res.body ? res.json() : null }
  }

  async function inserirSuper(
    loja: string | null, categoria: string, origem: string, valor: number, quando: string, qtd = 1,
  ) {
    await poolSuper.query(
      `insert into public.eventos_custo (loja_id, categoria, origem, valor_centavos, quantidade, criado_em)
       values ($1, $2::categoria_custo, $3, $4, $5, $6::timestamptz)`,
      [loja, categoria, origem, valor, qtd, quando],
    )
  }

  beforeAll(async () => {
    const env = envSchema.parse({
      DATABASE_URL: 'postgres://ignorado',
      SUPABASE_URL: 'https://exemplo.supabase.co',
      APP_URL: 'http://localhost:5173',
      RATE_LIMIT_MAX: '100000',
    })
    donoA = await criarUsuario(cenario)
    atendenteA = await criarUsuario(cenario)
    const donoB = await criarUsuario(cenario)
    operador = await criarUsuario(cenario)
    const contaA = await criarConta(cenario, donoA)
    const contaB = await criarConta(cenario, donoB)
    lojaA = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    await criarMembro(contaA, donoA, 'dono', lojaA)
    await criarMembro(contaA, atendenteA, 'atendente', lojaA)
    await criarMembro(contaB, donoB, 'dono', lojaB)
    await criarOperador(operador, 'operador')

    // Loja A, dia A: llm 100 + 50, whatsapp 200 (sao 350). Dia B: mapas 40.
    await inserirSuper(lojaA, 'llm', 'teste_custos.atendente', 100, noDia(DIA_A, '09:00:00'), 1000)
    await inserirSuper(lojaA, 'llm', 'teste_custos.atendente', 50, noDia(DIA_A, '23:30:00'), 500)
    await inserirSuper(lojaA, 'whatsapp', 'teste_custos.zap', 200, noDia(DIA_A, '12:00:00'), 4)
    await inserirSuper(lojaA, 'mapas', 'teste_custos.rota', 40, noDia(DIA_B))
    // Loja B no dia A: 7 (nunca pode vazar para a loja A).
    await inserirSuper(lojaB, 'fiscal', 'teste_custos.nfce', 7, noDia(DIA_A))
    // Plataforma, dia A: custo sem loja 11.
    await inserirSuper(null, 'whatsapp', 'teste_custos.otp', 11, noDia(DIA_A))

    const destino = new Writable({ write(c: Buffer, _e, cb) { logs.push(c.toString('utf8')); cb() } })
    app = await construirApp({
      env, pool: poolApi, logger: criarLogger('custos-teste', 'info', destino),
      verificador: verificadorFake,
      modulos: [{ prefixo: 'custos', plugin: custosRoutes }],
    })
    await app.ready()
  })

  afterAll(async () => {
    if (app) await app.close()
    await poolSuper.query(`delete from public.eventos_custo where origem like 'teste_custos%'`)
    await poolSuper.query(`delete from public.tarifas_meta where pais = 'ZZ'`).catch(() => {})
    await limpar(cenario)
    await fecharPools()
  })

  describe('visao da loja', () => {
    it('resumo da loja A so soma os custos dela (isolamento por loja_id)', async () => {
      const r = await get(donoA, `/resumo?de=${DIA_A}&ate=${DIA_A}`, lojaA)
      expect(r.status).toBe(200)
      expect(r.corpo.total_centavos).toBe(350)
      expect(r.corpo.por_categoria).toEqual([
        { categoria: 'whatsapp', total_centavos: 200, quantidade: 4, eventos: 1 },
        { categoria: 'llm', total_centavos: 150, quantidade: 1500, eventos: 2 },
      ])
      expect(r.corpo.por_dia).toEqual([{ dia: DIA_A, total_centavos: 350 }])
      expect(r.corpo.media_dia_centavos).toBe(350)
    })

    it('pico_dia e media no periodo de dois dias (fuso America/Sao_Paulo)', async () => {
      const r = await get(donoA, `/resumo?de=${DIA_A}&ate=${DIA_B}`, lojaA)
      expect(r.corpo.total_centavos).toBe(390)
      // 23:30 -03 do dia A continua no dia A (nao vira dia B por causa do UTC).
      expect(r.corpo.por_dia).toEqual([
        { dia: DIA_A, total_centavos: 350 },
        { dia: DIA_B, total_centavos: 40 },
      ])
      expect(r.corpo.pico_dia).toEqual({ dia: DIA_A, total_centavos: 350 })
      expect(r.corpo.media_dia_centavos).toBe(195)
    })

    it('periodo sem custo: zeros e pico null', async () => {
      const r = await get(donoA, `/resumo?de=2031-05-01&ate=2031-05-03`, lojaA)
      expect(r.corpo.total_centavos).toBe(0)
      expect(r.corpo.pico_dia).toBeNull()
      expect(r.corpo.media_dia_centavos).toBe(0)
    })

    it('loja B enxerga so o dela', async () => {
      const donoB = (await poolSuper.query('select dono_user_id from public.contas where id=(select conta_id from public.lojas where id=$1)', [lojaB])).rows[0].dono_user_id as string
      const r = await get(donoB, `/resumo?de=${DIA_A}&ate=${DIA_A}`, lojaB)
      expect(r.corpo.total_centavos).toBe(7)
    })

    it('eventos: so ids de referencia, sem loja_id e com paginacao por cursor', async () => {
      const p1 = await get(donoA, `/eventos?de=${DIA_A}&ate=${DIA_B}&limite=2`, lojaA)
      expect(p1.status).toBe(200)
      expect(p1.corpo.itens).toHaveLength(2)
      expect(p1.corpo.proximoCursor).not.toBeNull()
      const p2 = await get(donoA, `/eventos?de=${DIA_A}&ate=${DIA_B}&limite=2&cursor=${p1.corpo.proximoCursor}`, lojaA)
      expect(p2.corpo.itens).toHaveLength(2)
      expect(p2.corpo.proximoCursor).toBeNull()
      const ids = new Set([...p1.corpo.itens, ...p2.corpo.itens].map((i: { id: string }) => i.id))
      expect(ids.size).toBe(4)
      expect(Object.keys(p1.corpo.itens[0]).sort()).toEqual(
        ['categoria', 'criado_em', 'id', 'origem', 'quantidade', 'referencia', 'valor_centavos'],
      )
      const porCat = await get(donoA, `/eventos?de=${DIA_A}&ate=${DIA_B}&categoria=mapas`, lojaA)
      expect(porCat.corpo.itens).toHaveLength(1)
    })

    it('cursor invalido = 400 com envelope de erro', async () => {
      const r = await get(donoA, `/eventos?cursor=lixo`, lojaA)
      expect(r.status).toBe(400)
      expect(r.corpo.error.code).toBe('cursor_invalido')
    })

    it('periodo invalido (inverso, acima de 92 dias, formato, chave extra) = 400', async () => {
      expect((await get(donoA, `/resumo?de=2031-03-10&ate=2031-03-01`, lojaA)).status).toBe(400)
      expect((await get(donoA, `/resumo?de=2031-01-01&ate=2031-06-30`, lojaA)).status).toBe(400)
      expect((await get(donoA, `/resumo?de=10-03-2031`, lojaA)).status).toBe(400)
      expect((await get(donoA, `/resumo?loja_id=${lojaB}`, lojaA)).status).toBe(400)
    })

    it('atendente nao ve custo (403); sem login 401', async () => {
      expect((await get(atendenteA, `/resumo`, lojaA)).status).toBe(403)
      expect((await get(undefined, `/resumo`, lojaA)).status).toBe(401)
    })

    it('loja nao alcanca outra loja pelo header (x-loja-id alheio)', async () => {
      const r = await get(donoA, `/resumo?de=${DIA_A}&ate=${DIA_A}`, lojaB)
      expect(r.status).toBeGreaterThanOrEqual(400)
      expect(JSON.stringify(r.corpo)).not.toContain('"total_centavos":7')
    })

    it('membro de loja nao entra nas rotas de operador (403)', async () => {
      expect((await get(donoA, `/plataforma/resumo`)).status).toBe(403)
      expect((await get(donoA, `/plataforma/tarifas`)).status).toBe(403)
    })
  })

  describe('visao do operador', () => {
    it('agrega a base inteira sem loja_id nem conteudo', async () => {
      const r = await get(operador, `/plataforma/resumo?de=${DIA_A}&ate=${DIA_A}`)
      expect(r.status).toBe(200)
      // 350 (loja A) + 7 (loja B) + 11 (sem loja).
      expect(r.corpo.total_centavos).toBe(368)
      expect(r.corpo.lojas_com_custo).toBe(2)
      expect(r.corpo.sem_loja_centavos).toBe(11)
      expect(Object.keys(r.corpo).sort()).toEqual([
        'ate', 'de', 'lojas_com_custo', 'media_dia_centavos', 'pico_dia', 'por_categoria', 'por_dia',
        'por_origem', 'sem_loja_centavos', 'total_centavos',
      ])
      const texto = JSON.stringify(r.corpo)
      expect(texto).not.toContain(lojaA)
      expect(texto).not.toContain(lojaB)
    })

    it('operador sem loja nao usa as rotas de loja', async () => {
      expect((await get(operador, `/resumo`)).status).toBeGreaterThanOrEqual(400)
    })

    it('tarifas Meta: operador le o catalogo, com filtro por pais', async () => {
      await poolSuper.query(
        `insert into public.tarifas_meta (pais, categoria, valor_centavos, vigencia_inicio)
         values ('ZZ', 'marketing', 35, '2031-01-01'), ('ZZ', 'utility', 8, '2031-01-01')`,
      )
      const r = await get(operador, `/plataforma/tarifas?pais=ZZ`)
      expect(r.status).toBe(200)
      expect(r.corpo.itens).toHaveLength(2)
      expect(r.corpo.itens[0]).toMatchObject({ pais: 'ZZ', vigencia_fim: null })
      const f = await get(operador, `/plataforma/tarifas?pais=ZZ&categoria=utility`)
      expect(f.corpo.itens).toHaveLength(1)
      expect(f.corpo.itens[0].valor_centavos).toBe(8)
    })
  })

  describe('ingestao e append-only', () => {
    it('registrarEventoCusto grava e e idempotente por (origem, chave)', async () => {
      const entrada = {
        loja_id: lojaA, categoria: 'fiscal' as const, origem: 'teste_custos.ingestao',
        valor_centavos: 9, referencia: 'pedido:123', chave_idempotencia: 'k1',
      }
      await registrarEventoCusto(poolApi, entrada)
      await registrarEventoCusto(poolApi, entrada)
      const n = await poolSuper.query(`select count(*)::int as n, min(quantidade) as q from public.eventos_custo where origem='teste_custos.ingestao'`)
      expect(n.rows[0].n).toBe(1)
      expect(n.rows[0].q).toBe(1)
    })

    it('contrato do produtor rejeita centavos negativos, origem fora do padrao e campo extra', async () => {
      const base = { loja_id: lojaA, categoria: 'llm' as const, origem: 'teste_custos.x', valor_centavos: 1 }
      await expect(registrarEventoCusto(poolApi, { ...base, valor_centavos: -1 })).rejects.toThrow()
      await expect(registrarEventoCusto(poolApi, { ...base, origem: 'Origem Ruim' })).rejects.toThrow()
      await expect(registrarEventoCusto(poolApi, { ...base, conteudo: 'oi' } as never)).rejects.toThrow()
      await expect(registrarEventoCusto(poolApi, { ...base, referencia: 'tem espaco' })).rejects.toThrow()
    })

    async function sobRole(role: 'whaviso_api' | 'whaviso_zap' | 'whaviso_atendente', fn: (q: (s: string, p?: unknown[]) => Promise<unknown>) => Promise<void>) {
      const c = await poolSuper.connect()
      try {
        const sets = {
          whaviso_api: 'set role whaviso_api', whaviso_zap: 'set role whaviso_zap',
          whaviso_atendente: 'set role whaviso_atendente',
        } as const
        await c.query(sets[role])
        await fn((s, p) => c.query(s, p))
      } finally {
        await c.query('reset role').catch(() => {})
        c.release()
      }
    }

    it('zap e atendente inserem (sem SELECT); ninguem faz UPDATE nem DELETE', async () => {
      for (const role of ['whaviso_zap', 'whaviso_atendente'] as const) {
        await sobRole(role, async (q) => {
          await q(`insert into public.eventos_custo (loja_id, categoria, origem, valor_centavos, chave_idempotencia)
                   values (null, 'whatsapp', 'teste_custos.produtor', 1, $1) on conflict do nothing`, [`k-${role}`])
          await expect(q('select 1 from public.eventos_custo limit 1')).rejects.toThrow(/permission denied|permiss/)
        })
      }
      for (const role of ['whaviso_api', 'whaviso_zap', 'whaviso_atendente'] as const) {
        await sobRole(role, async (q) => {
          await expect(q(`update public.eventos_custo set valor_centavos = 0 where origem like 'teste_custos%'`)).rejects.toThrow(/permission denied|permiss/)
          await expect(q(`delete from public.eventos_custo where origem like 'teste_custos%'`)).rejects.toThrow(/permission denied|permiss/)
        })
      }
    })

    it('api nao escreve em tarifas_meta; trigger rejeita UPDATE ate para superusuario', async () => {
      await sobRole('whaviso_api', async (q) => {
        await expect(q(`insert into public.tarifas_meta (pais, categoria, valor_centavos, vigencia_inicio) values ('ZZ','service',1,'2031-01-01')`)).rejects.toThrow(/permission denied|permiss/)
        await expect(q(`delete from public.tarifas_meta where pais = 'ZZ'`)).rejects.toThrow(/permission denied|permiss/)
      })
      await expect(poolSuper.query(`update public.eventos_custo set valor_centavos = 0 where origem like 'teste_custos%'`)).rejects.toThrow(/append-only/)
    })

    it('constraints: valor negativo e referencia com conteudo livre sao barrados no banco', async () => {
      await expect(poolSuper.query(`insert into public.eventos_custo (categoria, origem, valor_centavos) values ('llm','teste_custos.c',-1)`)).rejects.toThrow()
      await expect(poolSuper.query(`insert into public.eventos_custo (categoria, origem, valor_centavos, referencia) values ('llm','teste_custos.c',1,'ola, meu telefone e 1199')`)).rejects.toThrow()
    })

    it('log nao carrega ids de loja de outra loja nem valores sensiveis', () => {
      expect(logs.join('')).not.toContain('pedido:123')
    })
  })
})
