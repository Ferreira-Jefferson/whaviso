// Integracao do runner da Central de Evals (drenar_evals) no Postgres LOCAL, sob o role
// whaviso_atendente (menor privilegio real: SELECT em suites/casos/execucoes, UPDATE so das colunas de
// andamento, INSERT/SELECT em resultados). LLM e embeddings FALSOS (sem rede). Sem banco, pula.
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { EvalResumo } from '@whaviso/shared/contracts'
import { falha, ok } from '@whaviso/shared/clientes'
import { criarLogger } from '@whaviso/shared/logger'
import { drenarEvals, reivindicarExecucao, type DepsEvals } from '../src/drenar_evals'
import { LlmIndisponivel, SaidaInvalida, type AdaptadorProvedor, type ServicoLlm } from '../src/shared/llm_client'
import {
  criarClienteEmbeddingsPlataforma,
  criarRerankerNulo,
  DIM_EMBEDDING,
  ingerirDocumento,
  _resetVetorCache,
} from '../src/shared/rag'
import { bancoAcessivel, fecharPools, limpar, poolAtendente, poolSuper, semear } from './db'

const online = await bancoAcessivel()
const logger = criarLogger('evals-it', 'silent')
const uso = { tokensIn: 5, tokensOut: 2, custoEstimadoCentavos: 1 }
const resp = (texto: string) => ({ texto, chamadasFerramenta: [], modelo: 'm', uso })

interface Espiao {
  modelos: Array<string | undefined>
}

/** Servico falso: intencao por frase (ou erro de LLM), geracao fixa e juiz fixo. */
function servicoFalso(op: { intencoes?: Record<string, unknown>; indisponivelPara?: string; veredito?: string } = {}) {
  const esp: Espiao = { modelos: [] }
  const servico = {
    async completarEstruturado(e: { modelo?: string; mensagens: Array<{ conteudo: string }> }, schema: { safeParse(v: unknown): { success: boolean; data?: unknown } }) {
      esp.modelos.push(e.modelo)
      const texto = e.mensagens.map((m) => m.conteudo).join('\n')
      if (op.indisponivelPara && texto.includes(op.indisponivelPara)) return falha(new LlmIndisponivel())
      const chave = Object.keys(op.intencoes ?? {}).find((k) => texto.includes(k))
      const saida = chave ? op.intencoes![chave] : op.veredito ? { veredito: op.veredito } : undefined
      const p = schema.safeParse(saida)
      return p.success ? ok({ dados: p.data, resposta: resp('') }) : falha(new SaidaInvalida())
    },
    async completar(e: { modelo?: string }) {
      esp.modelos.push(e.modelo)
      return ok(resp('Sim, o X-Tudo leva bacon.'))
    },
  } as unknown as ServicoLlm
  return { servico, esp }
}

function adaptadorEmbedding(): AdaptadorProvedor {
  const nao = (): never => {
    throw new Error('nao usado')
  }
  return {
    provedor: 'openrouter',
    completar: nao as never,
    transcrever: nao as never,
    descreverImagem: nao as never,
    async embutir(e) {
      return ok({ vetores: e.textos.map(() => new Array(DIM_EMBEDDING).fill(0.1) as number[]), uso: { tokensIn: 1, tokensOut: 0, custoEstimadoCentavos: 0 } })
    },
  } as AdaptadorProvedor
}
const embeddings = () => criarClienteEmbeddingsPlataforma({ adaptador: adaptadorEmbedding(), logger, obterChave: () => 'chave-de-teste' })

function deps(servico: ServicoLlm): DepsEvals {
  return { pool: poolAtendente, logger, servico, rag: { exec: poolAtendente, embeddings: embeddings(), reranker: criarRerankerNulo() } }
}

// ---- seeds (superusuario) ----------------------------------------------------------------------
const suitesCriadas: string[] = []
const contas: string[] = []

async function criarSuite(tipo: string): Promise<string> {
  const r = await poolSuper.query('insert into public.eval_suites (nome, tipo) values ($1,$2) returning id', [`suite ${tipo}`, tipo])
  suitesCriadas.push(r.rows[0].id)
  return r.rows[0].id as string
}
async function criarCaso(suiteId: string, nome: string, entrada: unknown, esperado: unknown): Promise<string> {
  const r = await poolSuper.query(
    'insert into public.eval_casos (suite_id, nome, entrada, esperado) values ($1,$2,$3::jsonb,$4::jsonb) returning id',
    [suiteId, nome, JSON.stringify(entrada), JSON.stringify(esperado)],
  )
  return r.rows[0].id as string
}
async function enfileirar(suiteId: string, lojaId: string, extra: { modelo?: string; config?: unknown } = {}): Promise<string> {
  const r = await poolSuper.query(
    'insert into public.eval_execucoes (suite_id, loja_alvo_id, modelo, config) values ($1,$2,$3,$4::jsonb) returning id',
    [suiteId, lojaId, extra.modelo ?? null, JSON.stringify(extra.config ?? {})],
  )
  return r.rows[0].id as string
}
async function execucao(id: string) {
  const r = await poolSuper.query('select * from public.eval_execucoes where id = $1', [id])
  return r.rows[0] as { status: string; resumo: unknown; erro: string | null; iniciada_em: Date | null; concluida_em: Date | null }
}
async function resultados(id: string) {
  const r = await poolSuper.query('select * from public.eval_resultados where execucao_id = $1 order by criado_em, id', [id])
  return r.rows as Array<{ caso_id: string | null; status: string; scores: Record<string, number>; saida: Record<string, unknown> | null; erro: string | null }>
}

afterEach(async () => {
  while (suitesCriadas.length) {
    const s = suitesCriadas.pop()!
    await poolSuper.query('delete from public.eval_resultados where execucao_id in (select id from public.eval_execucoes where suite_id = $1)', [s])
    await poolSuper.query('delete from public.eval_execucoes where suite_id = $1', [s])
    await poolSuper.query('delete from public.eval_casos where suite_id = $1', [s])
    await poolSuper.query('delete from public.eval_suites where id = $1', [s])
  }
  while (contas.length) await limpar(contas.pop()!)
})
afterAll(fecharPools)

describe.skipIf(!online)('drenar_evals (role whaviso_atendente)', () => {
  it('claim: fila -> rodando (commitado), sem reivindicar duas vezes', async () => {
    const a = await semear()
    contas.push(a.contaId)
    const suite = await criarSuite('nlu_intencao')
    const id = await enfileirar(suite, a.lojaId)

    const claim = await reivindicarExecucao(poolAtendente)
    expect(claim?.id).toBe(id)
    const depois = await execucao(id)
    expect(depois.status).toBe('rodando')
    expect(depois.iniciada_em).not.toBeNull()
    expect(depois.concluida_em).toBeNull()
    expect(await reivindicarExecucao(poolAtendente)).toBeNull()
  })

  it('nlu_intencao ponta a ponta: fila -> concluida, resultado por caso e resumo valido', async () => {
    const a = await semear()
    contas.push(a.contaId)
    const suite = await criarSuite('nlu_intencao')
    const ok1 = await criarCaso(suite, 'burger', { texto: 'quero um burger' }, { tipo: 'adicionar_item', itens: ['Burger'] })
    const ruim = await criarCaso(suite, 'errado', { texto: 'quero um burger' }, { tipo: 'cancelar' })
    const id = await enfileirar(suite, a.lojaId, { modelo: 'meu/modelo-sweep' })
    const { servico, esp } = servicoFalso({ intencoes: { burger: { tipo: 'adicionar_item', confianca: 0.95, item: 'burger' } } })

    const r = await drenarEvals(deps(servico))
    expect(r).toEqual({ concluidas: 1, falhas: 0 })

    const ex = await execucao(id)
    expect(ex.status).toBe('concluida')
    expect(ex.iniciada_em).not.toBeNull()
    expect(ex.concluida_em).not.toBeNull()
    const resumo = EvalResumo.parse(ex.resumo)
    expect(resumo).toMatchObject({ total: 2, passou: 1, falhou: 1, erro: 0, scoreMedio: 0.5, tokensIn: 10, tokensOut: 4 })

    const res = await resultados(id)
    expect(res.map((x) => [x.caso_id, x.status])).toEqual([[ok1, 'passou'], [ruim, 'falhou']])
    expect(new Set(esp.modelos)).toEqual(new Set(['meu/modelo-sweep']))
  })

  it('isola o erro por caso e conclui a rodada mesmo sem LLM', async () => {
    const a = await semear()
    contas.push(a.contaId)
    const suite = await criarSuite('nlu_intencao')
    await criarCaso(suite, 'quebra', { texto: 'quebra tudo' }, { tipo: 'confirmar' })
    await criarCaso(suite, 'ok', { texto: 'confirmo' }, { tipo: 'confirmar' })
    const id = await enfileirar(suite, a.lojaId)
    const { servico } = servicoFalso({ indisponivelPara: 'quebra', intencoes: { confirmo: { tipo: 'confirmar', confianca: 0.99 } } })

    expect(await drenarEvals(deps(servico))).toEqual({ concluidas: 1, falhas: 0 })
    const res = await resultados(id)
    expect(res.map((x) => [x.status, x.erro])).toEqual([['erro', 'sem_llm_indisponivel'], ['passou', null]])
    expect(EvalResumo.parse((await execucao(id)).resumo)).toMatchObject({ total: 2, passou: 1, erro: 1 })
  })

  it('suite sem casos termina em falha com codigo claro', async () => {
    const a = await semear()
    contas.push(a.contaId)
    const suite = await criarSuite('harness_turno')
    const id = await enfileirar(suite, a.lojaId)
    expect(await drenarEvals(deps(servicoFalso().servico))).toEqual({ concluidas: 0, falhas: 1 })
    expect(await execucao(id)).toMatchObject({ status: 'falha', erro: 'suite_sem_casos' })
  })

  it('execucao rodando ha tempo demais e marcada como interrompida', async () => {
    const a = await semear()
    contas.push(a.contaId)
    const suite = await criarSuite('nlu_intencao')
    const r = await poolSuper.query(
      `insert into public.eval_execucoes (suite_id, loja_alvo_id, status, iniciada_em)
       values ($1,$2,'rodando', now() - interval '3 hours') returning id`,
      [suite, a.lojaId],
    )
    await drenarEvals(deps(servicoFalso().servico))
    expect(await execucao(r.rows[0].id as string)).toMatchObject({ status: 'falha', erro: 'interrompida' })
  })

  describe('com base de conhecimento', () => {
    async function semearConhecimento(lojaId: string): Promise<string> {
      _resetVetorCache()
      const d = await poolSuper.query(
        `insert into public.documentos (loja_id, tipo, titulo, conteudo, status)
         values ($1,'descricao'::documento_tipo,'X-Tudo','O X-Tudo leva ovo e bacon, nao tem como tirar o ovo.','aprovado'::documento_status) returning id`,
        [lojaId],
      )
      const doc = d.rows[0].id as string
      await ingerirDocumento({ exec: poolAtendente, embeddings: embeddings(), logger }, doc)
      return doc
    }

    it('rag_retrieval: uma linha por pergunta do golden set (caso_id nulo) e hitAtK/contextRecall no resumo', async () => {
      const a = await semear()
      contas.push(a.contaId)
      const doc = await semearConhecimento(a.lojaId)
      await poolSuper.query('insert into public.base_avaliacao (loja_id, pergunta, docs_esperados) values ($1,$2,$3::uuid[]),($1,$4,$5::uuid[])', [
        a.lojaId, 'o x-tudo tem bacon?', [doc], 'voces vendem sushi?', ['99999999-9999-4999-8999-999999999999'],
      ])
      const suite = await criarSuite('rag_retrieval')
      const id = await enfileirar(suite, a.lojaId, { config: { k: 3 } })

      expect(await drenarEvals(deps(servicoFalso().servico))).toEqual({ concluidas: 1, falhas: 0 })
      const res = await resultados(id)
      expect(res).toHaveLength(2)
      expect(res.every((x) => x.caso_id === null)).toBe(true)
      expect(res.map((x) => x.status).sort()).toEqual(['falhou', 'passou'])
      const passou = res.find((x) => x.status === 'passou')!
      expect(passou.scores).toMatchObject({ hit: 1, recall: 1 })
      expect(passou.saida).toMatchObject({ pergunta: 'o x-tudo tem bacon?', docsEsperados: [doc], docsRecuperados: [doc] })
      const resumo = EvalResumo.parse((await execucao(id)).resumo)
      expect(resumo.porMetrica).toMatchObject({ hitAtK: 0.5, contextRecall: 0.5 })
      expect(resumo.latenciaP50Ms).toBeNull()
    })

    it('rag_retrieval com golden set vazio: falha golden_set_vazio', async () => {
      const a = await semear()
      contas.push(a.contaId)
      const suite = await criarSuite('rag_retrieval')
      const id = await enfileirar(suite, a.lojaId)
      await drenarEvals(deps(servicoFalso().servico))
      expect(await execucao(id)).toMatchObject({ status: 'falha', erro: 'golden_set_vazio' })
    })

    it('rag_faithfulness: gera, o juiz (modelo configurado) pontua e o score vai ao resumo', async () => {
      const a = await semear()
      contas.push(a.contaId)
      const doc = await semearConhecimento(a.lojaId)
      const suite = await criarSuite('rag_faithfulness')
      const caso = await criarCaso(suite, 'bacon', { consulta: 'o x-tudo tem bacon?' }, {})
      const id = await enfileirar(suite, a.lojaId, { modelo: 'openai/gerador-x', config: { judgeModelo: 'google/juiz-y' } })
      const { servico, esp } = servicoFalso({ veredito: 'fiel' })

      expect(await drenarEvals(deps(servico))).toEqual({ concluidas: 1, falhas: 0 })
      const [linha] = await resultados(id)
      expect(linha).toMatchObject({ caso_id: caso, status: 'passou', scores: { faithfulness: 1 } })
      expect(linha!.saida).toMatchObject({ veredito: 'fiel', documentos: [doc] })
      // geracao com o modelo do sweep, juiz com o modelo configurado
      expect(esp.modelos).toEqual(['openai/gerador-x', 'google/juiz-y'])
      expect(EvalResumo.parse((await execucao(id)).resumo)).toMatchObject({ total: 1, passou: 1, scoreMedio: 1, tokensIn: 10 })
    })

    it('rag_faithfulness com juiz incerto: erro juiz_incerto (nao entra na media)', async () => {
      const a = await semear()
      contas.push(a.contaId)
      await semearConhecimento(a.lojaId)
      const suite = await criarSuite('rag_faithfulness')
      await criarCaso(suite, 'x', { consulta: 'o x-tudo tem bacon?' }, {})
      const id = await enfileirar(suite, a.lojaId)
      await drenarEvals(deps(servicoFalso({ veredito: 'incerto' }).servico))
      const [linha] = await resultados(id)
      expect(linha).toMatchObject({ status: 'erro', erro: 'juiz_incerto' })
      expect(EvalResumo.parse((await execucao(id)).resumo)).toMatchObject({ erro: 1, scoreMedio: null })
    })
  })
})
