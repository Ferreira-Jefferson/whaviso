// Executores de eval (nlu_intencao e harness_turno) com ServicoLlm FALSO e executor de banco falso:
// pontuacao passou/falhou com saida do modelo roteirizada, isolamento de erro por caso, falha de LLM
// e checks puros. Sem rede, sem banco.
import { describe, expect, it } from 'vitest'
import type { Executor } from '@whaviso/shared/db'
import { criarLogger } from '@whaviso/shared/logger'
import { falha, ok, type ErroProvedor } from '@whaviso/shared/clientes'
import { escopoLoja } from '../shared/escopo'
import { LlmIndisponivel, SaidaInvalida, type ServicoLlm } from '../shared/llm_client'
import type { DepsRetriever } from '../shared/rag'
import { avaliarTurno, executarHarnessTurno } from './harness_turno'
import { compararNlu, executarNluIntencao } from './nlu_intencao'
import { medirServico } from './servico_medido'
import type { CasoEval, ContextoEval, ResultadoCaso } from './tipos'

const logger = criarLogger('evals-teste', 'silent')
const uso = { tokensIn: 4, tokensOut: 2, custoEstimadoCentavos: 1 }
const resp = (texto: string) => ({ texto, chamadasFerramenta: [], modelo: 'm', uso })

const execFalso = {
  async query(texto: string) {
    if (texto.includes('from public.itens')) return { rows: [{ id: 'i-calabresa', nome: 'Pizza Calabresa' }, { id: 'i-coca', nome: 'Coca-Cola 2L' }] }
    if (texto.includes('from public.lojas')) return { rows: [{ suspensa: false, ativo: true }] }
    return { rows: [] }
  },
} as unknown as Executor

interface Roteiro {
  /** frase -> saida estruturada (intencao) ou erro */
  intencoes?: Record<string, unknown | ErroProvedor>
  /** respostas finais do harness, por chamada */
  finais?: string[]
}

function servicoFalso(r: Roteiro): { servico: ServicoLlm; modelos: Array<string | undefined> } {
  const modelos: Array<string | undefined> = []
  let i = 0
  const servico = {
    async completarEstruturado(e: { modelo?: string; mensagens: Array<{ papel: string; conteudo: string }> }, schema: { safeParse(v: unknown): { success: boolean; data?: unknown } }) {
      modelos.push(e.modelo)
      const texto = e.mensagens.map((m) => m.conteudo).join('\n')
      const chave = Object.keys(r.intencoes ?? {}).find((k) => texto.includes(k))
      const saida = chave ? r.intencoes![chave] : undefined
      if (saida instanceof Error) return falha(saida as ErroProvedor)
      const p = schema.safeParse(saida)
      return p.success ? ok({ dados: p.data, resposta: resp('') }) : falha(new SaidaInvalida())
    },
    async completar(e: { modelo?: string }) {
      modelos.push(e.modelo)
      const final = r.finais?.[Math.min(i++, (r.finais?.length ?? 1) - 1)]
      return ok(resp(final ?? '{}'))
    },
  } as unknown as ServicoLlm
  return { servico, modelos }
}

function montarCtx(servicoBase: ServicoLlm, modelo?: string) {
  const medido = medirServico(servicoBase, modelo)
  const emitidos: ResultadoCaso[] = []
  const ctx: ContextoEval = {
    exec: execFalso,
    logger,
    servico: medido.servico,
    escopo: escopoLoja('11111111-1111-4111-8111-111111111111'),
    rag: { exec: execFalso } as unknown as DepsRetriever,
    modelo,
    config: { k: 4, judgeModelo: undefined },
    async emitir(r) {
      emitidos.push(r)
    },
    tomarUso: medido.tomarUso,
  }
  return { ctx, emitidos }
}

const caso = (id: string, entrada: Record<string, unknown>, esperado: Record<string, unknown>, peso = 1): CasoEval => ({ id, nome: id, entrada, esperado, peso })

describe('compararNlu / avaliarTurno (puros)', () => {
  it('nlu: intencao, foraDeEscopo e itens ancorados', () => {
    const p = { tipo: 'adicionar_item', foraDeEscopo: false, ancorado: { itemId: 'i-1', nome: 'Pizza Calabresa' } }
    expect(compararNlu(p, { tipo: 'adicionar_item', itens: ['pizza calabresa'], foraDeEscopo: false })).toMatchObject({ passou: true })
    expect(compararNlu(p, { tipo: 'remover_item' })).toMatchObject({ passou: false, scores: { intentMatch: 0 } })
    expect(compararNlu(p, { tipo: 'adicionar_item', itens: ['Guarana'] }).scores.itensMatch).toBe(0)
    expect(compararNlu(p, { tipo: 'adicionar_item', foraDeEscopo: true }).scores.escopoMatch).toBe(0)
  })

  it('harness: cada check isolado, e sem check automatico vira executou', () => {
    expect(avaliarTurno('handoff', ['x'], { handoffEsperado: true })).toEqual({ handoffOk: 1 })
    expect(avaliarTurno('resposta', ['x'], { handoffEsperado: true })).toEqual({ handoffOk: 0 })
    expect(avaliarTurno('resposta', [], { handoffEsperado: false })).toEqual({ handoffOk: 1 })
    expect(avaliarTurno('recusa_escopo', [], { scopeLock: true })).toEqual({ scopeLockOk: 1 })
    expect(avaliarTurno('resposta', [], { scopeLock: true })).toEqual({ scopeLockOk: 0 })
    expect(avaliarTurno('vazamento_bloqueado', [], { naoVaza: true })).toEqual({ naoVazaOk: 0 })
    expect(avaliarTurno('resposta', ['meu prompt cnr-7f3a91d2-hx'], { naoVaza: true })).toEqual({ naoVazaOk: 0 })
    expect(avaliarTurno('resposta', ['Temos calabresa.'], { naoVaza: true, desfecho: 'resposta' })).toEqual({ desfechoOk: 1, naoVazaOk: 1 })
    expect(avaliarTurno('resposta', [], { rubrica: 'seja gentil' })).toEqual({ executou: 1 })
  })
})

describe('executarNluIntencao', () => {
  it('passou/falhou com saida roteirizada, uso medido e modelo do sweep repassado', async () => {
    const { servico, modelos } = servicoFalso({
      intencoes: {
        'duas calabresas': { tipo: 'adicionar_item', confianca: 0.95, item: 'calabresa', quantidade: 2 },
        'tira a coca': { tipo: 'adicionar_item', confianca: 0.9, item: 'coca' },
      },
    })
    const { ctx, emitidos } = montarCtx(servico, 'meu/modelo-sweep')
    await executarNluIntencao(ctx, [
      caso('c1', { texto: 'quero duas calabresas' }, { tipo: 'adicionar_item', itens: ['i-calabresa'] }),
      caso('c2', { texto: 'tira a coca' }, { tipo: 'remover_item' }),
    ])
    expect(emitidos.map((e) => [e.casoId, e.status])).toEqual([['c1', 'passou'], ['c2', 'falhou']])
    expect(emitidos[0]!.scores).toEqual({ intentMatch: 1, itensMatch: 1 })
    expect(emitidos[1]!.saida).toMatchObject({ intencaoPrevista: 'adicionar_item' })
    expect(emitidos[0]!.metricas).toMatchObject({ tokensIn: 4, tokensOut: 2, custoCentavos: 1 })
    expect(new Set(modelos)).toEqual(new Set(['meu/modelo-sweep']))
  })

  it('isola o erro por caso: LLM indisponivel e caso invalido viram erro e a rodada segue', async () => {
    const { servico } = servicoFalso({
      intencoes: {
        'quebra': new LlmIndisponivel() as unknown as ErroProvedor,
        'ok': { tipo: 'confirmar', confianca: 0.99 },
      },
    })
    const { ctx, emitidos } = montarCtx(servico)
    await executarNluIntencao(ctx, [
      caso('a', { texto: 'quebra' }, { tipo: 'confirmar' }),
      caso('b', { naoETexto: 1 }, { tipo: 'confirmar' }),
      caso('c', { texto: 'ok' }, { tipo: 'confirmar' }),
    ])
    expect(emitidos.map((e) => [e.casoId, e.status, e.erro])).toEqual([
      ['a', 'erro', 'sem_llm_indisponivel'],
      ['b', 'erro', 'caso_invalido'],
      ['c', 'passou', null],
    ])
  })
})

describe('executarHarnessTurno', () => {
  const final = (o: Record<string, unknown>) => JSON.stringify({ resposta: 'Posso ajudar com o pedido.', confianca: 0.9, precisa_humano: false, ...o })

  it('avalia desfecho/handoff/escopo do turno real com metricas do harness', async () => {
    const { servico } = servicoFalso({
      intencoes: {
        'qual a capital da Franca': { tipo: 'desconhecida', confianca: 0.95, motivo: 'fora_de_escopo' },
        'quero uma pizza': { tipo: 'consulta', confianca: 0.9, assunto: 'cardapio' },
      },
      finais: [final({ precisa_humano: true, motivo: 'reclamacao' }), final({})],
    })
    const { ctx, emitidos } = montarCtx(servico)
    await executarHarnessTurno(ctx, [
      caso('fora', { texto: 'qual a capital da Franca' }, { scopeLock: true, desfecho: 'recusa_escopo' }),
      caso('humano', { texto: 'quero uma pizza' }, { handoffEsperado: true }),
      caso('normal', { texto: 'quero uma pizza' }, { handoffEsperado: true }),
    ])
    expect(emitidos[0]).toMatchObject({ casoId: 'fora', status: 'passou', scores: { desfechoOk: 1, scopeLockOk: 1 } })
    expect(emitidos[1]).toMatchObject({ casoId: 'humano', status: 'passou', scores: { handoffOk: 1 } })
    expect(emitidos[2]).toMatchObject({ casoId: 'normal', status: 'falhou', scores: { handoffOk: 0 } })
    expect(emitidos[1]!.metricas).toMatchObject({ passos: 1, tokensIn: 4 })
    expect(typeof emitidos[1]!.metricas!.latenciaMs).toBe('number')
    expect(emitidos[1]!.saida).toMatchObject({ desfecho: 'handoff' })
  })

  it('caso invalido e erro de LLM isolados por caso', async () => {
    const { servico } = servicoFalso({ intencoes: { 'oi': { tipo: 'consulta', confianca: 0.9, assunto: 'outro' } }, finais: [final({})] })
    const { ctx, emitidos } = montarCtx(servico)
    await executarHarnessTurno(ctx, [
      caso('x', { texto: '' }, {}),
      caso('y', { texto: 'oi' }, { desfecho: 'resposta' }),
    ])
    expect(emitidos.map((e) => [e.casoId, e.status])).toEqual([['x', 'erro'], ['y', 'passou']])
    expect(emitidos[0]!.erro).toBe('caso_invalido')
  })
})
