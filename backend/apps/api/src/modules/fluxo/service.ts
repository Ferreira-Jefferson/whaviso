// Regra do modulo. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
// O grafo e entrada nao confiavel: a publicacao revalida tudo no servidor. Nada do grafo vai a log.
import { z } from 'zod'
import { transacao, type Pool } from '@whaviso/shared/db'
import { conflito, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import * as repo from './repo'
import { validarGrafo } from './validar'
import {
  CATALOGO_NODES, FLUXO_PADRAO,
  type FluxoDto, type FluxoNovo, type FluxoRascunhoEntrada, type FluxoValidacao,
} from './schemas'

export interface Ator {
  lojaId: string
  userId: string
}

/** Motivo legivel e curto do 422 grafo_invalido (codigo + node/aresta, sem valores de config). */
function motivo(v: FluxoValidacao): string {
  const partes = v.erros.slice(0, 5).map((e) => {
    const onde = e.node_id ? ` [node ${e.node_id}]` : e.edge_id ? ` [conexao ${e.edge_id}]` : ''
    return `${e.codigo}${onde}: ${e.mensagem}`
  })
  const resto = v.erros.length > 5 ? ` (+${v.erros.length - 5} erros)` : ''
  return `Grafo invalido: ${partes.join('; ')}${resto}`
}

export function criarServicoFluxo(pool: Pool) {
  async function fluxoOuErro(exec: Parameters<typeof repo.obterFluxo>[0], a: Ator, id: string) {
    const f = await repo.obterFluxo(exec, a.lojaId, id)
    if (!f) throw naoEncontrado('Fluxo nao encontrado')
    return f
  }

  async function montar(exec: Parameters<typeof repo.obterFluxo>[0], a: Ator, id: string): Promise<FluxoDto> {
    const f = await fluxoOuErro(exec, a, id)
    const [pub, ras] = await Promise.all([
      repo.versaoPorStatus(exec, a.lojaId, id, 'publicada'),
      repo.versaoPorStatus(exec, a.lojaId, id, 'rascunho'),
    ])
    return { ...f, publicada: pub ? repo.paraDto(pub) : null, rascunho: ras ? repo.paraDto(ras) : null }
  }

  return {
    /** Catalogo fechado de nodes (projecao dos descritores; nada e executado). */
    catalogo() {
      return {
        nodes: CATALOGO_NODES.map((d) => ({
          tipo: d.tipo, rotulo: d.rotulo, usa_llm: d.usaLlm, irreversivel: d.irreversivel,
          terminal: d.terminal, obrigatorio: d.obrigatorio,
          handles: d.handles.map((h) => ({ ...h })),
          config_schema: z.toJSONSchema(d.configSchema, { io: 'input' }) as Record<string, unknown>,
        })),
      }
    },

    async listar(a: Ator) {
      return { itens: await repo.listarFluxos(pool, a.lojaId) }
    },

    async detalhe(a: Ator, id: string) {
      return montar(pool, a, id)
    },

    /** Cria o fluxo (inativo) com a versao 1 em rascunho: do grafo enviado ou do padrao. */
    async criar(a: Ator, entrada: FluxoNovo) {
      const id = await transacao(pool, async (tx) => {
        const novo = await repo.inserirFluxo(tx, a.lojaId, entrada.nome)
        await repo.inserirRascunho(tx, a.lojaId, novo, entrada.grafo ?? FLUXO_PADRAO, a.userId)
        await repo.registrarEvento(tx, { lojaId: a.lojaId, tipo: 'fluxo.rascunho_criado', fluxoId: novo, userId: a.userId })
        return novo
      })
      return montar(pool, a, id)
    },

    /** Salva o grafo no rascunho (so a forma e exigida; a regra e checada em validar/publicar). */
    async salvarRascunho(a: Ator, id: string, entrada: FluxoRascunhoEntrada) {
      await transacao(pool, async (tx) => {
        if (!(await repo.travarFluxo(tx, a.lojaId, id))) throw naoEncontrado('Fluxo nao encontrado')
        const ras = await repo.versaoPorStatus(tx, a.lojaId, id, 'rascunho')
        if (!ras) {
          await repo.inserirRascunho(tx, a.lojaId, id, entrada.grafo, a.userId)
          await repo.registrarEvento(tx, { lojaId: a.lojaId, tipo: 'fluxo.rascunho_criado', fluxoId: id, userId: a.userId })
          return
        }
        if (entrada.atualizado_em_base && entrada.atualizado_em_base !== ras.atualizado_em) {
          throw conflito('conflito_edicao', 'O rascunho foi alterado por outra edicao; recarregue')
        }
        await repo.atualizarRascunho(tx, a.lojaId, ras.id, entrada.grafo)
      })
      return montar(pool, a, id)
    },

    async validarRascunho(a: Ator, id: string): Promise<FluxoValidacao> {
      await fluxoOuErro(pool, a, id)
      const ras = await repo.versaoPorStatus(pool, a.lojaId, id, 'rascunho')
      if (!ras) throw regraNegocio('sem_rascunho', 'Nao ha rascunho para validar')
      return validarGrafo(ras.grafo)
    },

    /** Publica atomicamente: revalida no servidor, arquiva a anterior e torna o rascunho imutavel. */
    async publicar(a: Ator, id: string) {
      await transacao(pool, async (tx) => {
        if (!(await repo.travarFluxo(tx, a.lojaId, id))) throw naoEncontrado('Fluxo nao encontrado')
        const ras = await repo.versaoPorStatus(tx, a.lojaId, id, 'rascunho')
        if (!ras) throw regraNegocio('sem_rascunho', 'Nao ha rascunho para publicar')
        const v = validarGrafo(ras.grafo)
        if (!v.valido) throw regraNegocio('grafo_invalido', motivo(v))
        await repo.publicarRascunho(tx, a.lojaId, id, ras.id)
        await repo.registrarEvento(tx, {
          lojaId: a.lojaId, tipo: 'fluxo.publicado', fluxoId: id, userId: a.userId, versao: ras.versao,
        })
      })
      return montar(pool, a, id)
    },

    async listarVersoes(a: Ator, id: string) {
      await fluxoOuErro(pool, a, id)
      return { itens: await repo.listarVersoes(pool, a.lojaId, id) }
    },

    async obterVersao(a: Ator, id: string, numero: number) {
      await fluxoOuErro(pool, a, id)
      const v = await repo.versaoPorNumero(pool, a.lojaId, id, numero)
      if (!v) throw naoEncontrado('Versao nao encontrada')
      return repo.paraDto(v)
    },

    /** Cria rascunho novo a partir de uma versao anterior (nunca reescreve a publicada). */
    async restaurar(a: Ator, id: string, numero: number) {
      await transacao(pool, async (tx) => {
        if (!(await repo.travarFluxo(tx, a.lojaId, id))) throw naoEncontrado('Fluxo nao encontrado')
        const origem = await repo.versaoPorNumero(tx, a.lojaId, id, numero)
        if (!origem) throw naoEncontrado('Versao nao encontrada')
        if (await repo.versaoPorStatus(tx, a.lojaId, id, 'rascunho')) {
          throw conflito('rascunho_existente', 'Ja existe um rascunho; publique-o ou edite-o antes de restaurar')
        }
        const nova = await repo.inserirRascunho(tx, a.lojaId, id, origem.grafo, a.userId)
        await repo.registrarEvento(tx, {
          lojaId: a.lojaId, tipo: 'fluxo.restaurado', fluxoId: id, userId: a.userId, versao: nova,
        })
      })
      return montar(pool, a, id)
    },

    /** Ativa (so com versao publicada) ou desativa; no maximo um fluxo ativo por loja. */
    async definirAtivo(a: Ator, id: string, ativo: boolean) {
      await transacao(pool, async (tx) => {
        if (!(await repo.travarFluxo(tx, a.lojaId, id))) throw naoEncontrado('Fluxo nao encontrado')
        if (ativo && !(await repo.versaoPorStatus(tx, a.lojaId, id, 'publicada'))) {
          throw regraNegocio('sem_versao_publicada', 'Publique uma versao antes de ativar o fluxo')
        }
        await repo.definirAtivo(tx, a.lojaId, id, ativo)
        await repo.registrarEvento(tx, {
          lojaId: a.lojaId, tipo: ativo ? 'fluxo.ativado' : 'fluxo.desativado', fluxoId: id, userId: a.userId,
        })
      })
      return montar(pool, a, id)
    },
  }
}
