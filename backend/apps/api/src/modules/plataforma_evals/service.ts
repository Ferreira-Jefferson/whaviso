// Regra do modulo. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
import type { Pool } from '@whaviso/shared/db'
import { HttpError, Conflito, NaoEncontrado } from '../../shared/http_errors'
import { deltasAgregados, diffCasos } from './metricas'
import * as repo from './repo'
import {
  evalPayloadPorTipo,
  type EvalTipo,
} from './schemas'
import type { z } from 'zod'
import type {
  EvalBaselineDefinir, EvalCasoAtualizar, EvalCasoCriar, EvalExecucaoCriar, EvalExecucaoFiltro,
  EvalSuiteAtualizar, EvalSuiteCriar,
} from '@whaviso/shared/contracts'

type Obj = Record<string, unknown>

const invalido = (msg: string) => new HttpError(400, 'entrada_invalida', msg)

/** Valida entrada/esperado contra os schemas do tipo da suite; devolve os objetos ja parseados. */
function validarPayload(tipo: EvalTipo, entrada: Obj, esperado: Obj): { entrada: Obj; esperado: Obj } {
  const s = evalPayloadPorTipo[tipo]
  const e = (s.entrada as z.ZodType<Obj>).safeParse(entrada)
  if (!e.success) throw invalido(`entrada invalida para suite ${tipo}`)
  const x = (s.esperado as z.ZodType<Obj>).safeParse(esperado)
  if (!x.success) throw invalido(`esperado invalido para suite ${tipo}`)
  return { entrada: e.data, esperado: x.data }
}

export function criarServicoEvals(pool: Pool) {
  const suiteOu404 = async (id: string) =>
    (await repo.buscarSuite(pool, id)) ?? (() => { throw new NaoEncontrado('Suite nao encontrada') })()
  const execOu404 = async (id: string) =>
    (await repo.buscarExecucao(pool, id)) ?? (() => { throw new NaoEncontrado('Execucao nao encontrada') })()

  return {
    listarSuites: (ativo?: boolean) => repo.listarSuites(pool, ativo),
    criarSuite: (d: EvalSuiteCriar) =>
      repo.criarSuite(pool, { nome: d.nome, tipo: d.tipo, familia: d.familia ?? 'capability', descricao: d.descricao ?? null }),
    async atualizarSuite(id: string, d: EvalSuiteAtualizar) {
      const r = await repo.atualizarSuite(pool, id, d)
      if (!r) throw new NaoEncontrado('Suite nao encontrada')
      return r
    },

    async listarCasos(suiteId: string) {
      await suiteOu404(suiteId)
      return repo.listarCasos(pool, suiteId)
    },
    async criarCaso(suiteId: string, d: EvalCasoCriar) {
      const suite = await suiteOu404(suiteId)
      const p = validarPayload(suite.tipo, d.entrada, d.esperado ?? {})
      return repo.criarCaso(pool, {
        suiteId, nome: d.nome, entrada: p.entrada, esperado: p.esperado,
        peso: d.peso ?? 1, origem: d.origem ?? 'manual',
      })
    },
    async atualizarCaso(id: string, d: EvalCasoAtualizar) {
      const atual = await repo.buscarCaso(pool, id)
      if (!atual) throw new NaoEncontrado('Caso nao encontrado')
      let { entrada, esperado } = d
      if (entrada !== undefined || esperado !== undefined) {
        const suite = await suiteOu404(atual.suite_id)
        const p = validarPayload(suite.tipo, entrada ?? atual.entrada, esperado ?? atual.esperado)
        entrada = entrada === undefined ? undefined : p.entrada
        esperado = esperado === undefined ? undefined : p.esperado
      }
      const r = await repo.atualizarCaso(pool, id, { ...d, entrada, esperado })
      if (!r) throw new NaoEncontrado('Caso nao encontrado')
      return r
    },

    listarLojasAlvo: () => repo.listarLojasAlvo(pool),

    async enfileirar(d: EvalExecucaoCriar, operadorUserId: string) {
      await suiteOu404(d.suiteId)
      if (!(await repo.lojaExiste(pool, d.lojaAlvoId))) throw new NaoEncontrado('Loja alvo nao encontrada')
      return repo.enfileirarExecucao(pool, {
        suiteId: d.suiteId, lojaAlvoId: d.lojaAlvoId, modelo: d.modelo ?? null,
        provedor: d.provedor ?? null, config: d.config ?? {}, disparadaPor: operadorUserId,
      })
    },
    listarExecucoes: (f: EvalExecucaoFiltro) => repo.listarExecucoes(pool, f),
    async detalhe(id: string) {
      const execucao = await execOu404(id)
      return { execucao, resultados: await repo.listarResultados(pool, id) }
    },

    async comparar(idA: string, idB: string) {
      const [execucaoA, execucaoB] = await Promise.all([execOu404(idA), execOu404(idB)])
      const [ra, rb] = await Promise.all([repo.listarResultados(pool, idA), repo.listarResultados(pool, idB)])
      const ids = [...new Set([...ra, ...rb].flatMap((r) => (r.caso_id ? [r.caso_id] : [])))]
      const nomes = await repo.nomesDeCasos(pool, ids)
      return {
        execucaoA, execucaoB,
        deltas: deltasAgregados(execucaoA.resumo, execucaoB.resumo),
        casos: diffCasos(ra, rb, nomes),
      }
    },

    async definirBaseline(d: EvalBaselineDefinir) {
      if (d.execucaoId === d.baselineId) throw invalido('Uma execucao nao pode ser baseline de si mesma')
      const [exec, base] = await Promise.all([execOu404(d.execucaoId), execOu404(d.baselineId)])
      if (exec.suite_id !== base.suite_id) throw invalido('Baseline deve ser da mesma suite')
      const r = await repo.definirBaseline(pool, d.execucaoId, d.baselineId)
      return r ?? (() => { throw new NaoEncontrado('Execucao nao encontrada') })()
    },

    async cancelar(id: string) {
      const r = await repo.cancelarSeFila(pool, id)
      if (r) return r
      await execOu404(id)
      throw new Conflito('So e possivel cancelar execucao na fila')
    },
  }
}
