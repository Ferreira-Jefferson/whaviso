// Regras da curadoria do conhecimento (RAG.md secoes 3 e 7). Sem HTTP; erros de dominio via
// shared/http_errors. A api NAO embedda: aprovar grava o documento como `aprovado` + um evento
// `conhecimento.documento_aprovado` (eventos, sem PII); a ingestao e do atendente. Conteudo de
// documento/pergunta/feedback nunca vai a log nem a `eventos`.
import { comTransacao, type Pool } from '@whaviso/shared/db'
import { conflito, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import * as repo from './repo'
import { validarDocumento, validarPergunta } from './validador'

export interface Ator {
  lojaId: string
  userId: string
}

type TipoDoc = repo.TipoDoc

const ROTULO: Record<string, string> = {
  preco: 'preco',
  temporal: 'referencia de tempo (hoje, agora)',
  disponibilidade: 'disponibilidade/estoque',
  status_pedido: 'status de pedido',
  telefone: 'telefone',
  pix: 'dado de Pix',
  segredo: 'segredo/chave',
}

function exigirEstavel(...textos: string[]): void {
  const v = validarDocumento(...textos)
  if (!v.ok) {
    const lista = v.motivos.map((m) => ROTULO[m] ?? m).join(', ')
    throw regraNegocio(
      'conteudo_nao_estavel',
      `O conhecimento guarda so informacao estavel. Remova: ${lista}. Preco e disponibilidade ficam no cardapio.`,
    )
  }
}

function exigirSemSensivel(...textos: string[]): void {
  const v = validarPergunta(...textos)
  if (!v.ok) {
    const lista = v.motivos.map((m) => ROTULO[m] ?? m).join(', ')
    throw regraNegocio('conteudo_sensivel', `Remova dado sensivel do texto: ${lista}.`)
  }
}

async function docOuErro(exec: Pick<Pool, 'query'>, lojaId: string, id: string, travar = false) {
  const d = await repo.obterDocumento(exec, lojaId, id, travar)
  if (!d) throw naoEncontrado('Documento nao encontrado')
  return d
}

// ---------------------------------------------------------------- documentos
export function criarServico(pool: Pool) {
  return {
    async listarDocumentos(a: Ator, f: { status?: string | undefined; tipo?: string | undefined; limite: number }) {
      return { itens: await repo.listarDocumentos(pool, a.lojaId, f) }
    },

    async obterDocumento(a: Ator, id: string) {
      return docOuErro(pool, a.lojaId, id)
    },

    async versoes(a: Ator, id: string) {
      await docOuErro(pool, a.lojaId, id)
      return { versoes: await repo.versoesDoDocumento(pool, a.lojaId, id) }
    },

    async criarDocumento(a: Ator, e: { tipo: TipoDoc; titulo: string; conteudo: string }) {
      exigirEstavel(e.titulo, e.conteudo)
      return comTransacao(pool, async (tx) => {
        const id = await repo.inserirDocumento(tx, a.lojaId, { ...e, origem: 'manual', userId: a.userId })
        await repo.auditar(tx, a.lojaId, 'conhecimento.documento_criado', 'documento', id, {
          user_id: a.userId,
          versao: 1,
        })
        return docOuErro(tx, a.lojaId, id)
      })
    },

    /** Rascunho: altera no lugar. Aprovado: cria nova versao (rascunho) e mantem a atual ate aprovar. */
    async atualizarDocumento(
      a: Ator,
      id: string,
      p: { tipo?: TipoDoc | undefined; titulo?: string | undefined; conteudo?: string | undefined },
    ) {
      return comTransacao(pool, async (tx) => {
        const atual = await docOuErro(tx, a.lojaId, id, true)
        if (atual.status === 'arquivado') {
          throw regraNegocio('documento_arquivado', 'Documento arquivado nao pode ser editado')
        }
        const novo = {
          tipo: p.tipo ?? atual.tipo,
          titulo: p.titulo ?? atual.titulo,
          conteudo: p.conteudo ?? atual.conteudo,
        }
        exigirEstavel(novo.titulo, novo.conteudo)
        if (atual.status === 'rascunho') {
          await repo.atualizarRascunho(tx, a.lojaId, id, novo)
          await repo.auditar(tx, a.lojaId, 'conhecimento.documento_editado', 'documento', id, {
            user_id: a.userId,
          })
          return docOuErro(tx, a.lojaId, id)
        }
        if (await repo.sucessorPendente(tx, a.lojaId, id)) {
          throw conflito('versao_pendente', 'Ja existe uma nova versao em rascunho deste documento')
        }
        const novoId = await repo.inserirDocumento(tx, a.lojaId, {
          ...novo,
          origem: 'manual',
          versao: atual.versao + 1,
          substituiId: id,
          userId: a.userId,
        })
        await repo.auditar(tx, a.lojaId, 'conhecimento.documento_criado', 'documento', novoId, {
          user_id: a.userId,
          versao: atual.versao + 1,
          substitui_id: id,
        })
        return docOuErro(tx, a.lojaId, novoId)
      })
    },

    /**
     * Aprova um rascunho (revalida a trava). Se ele substitui uma versao aprovada, arquiva a
     * anterior na mesma transacao (indice sempre coerente). Dispara o evento para a ingestao.
     */
    async aprovar(a: Ator, id: string) {
      return comTransacao(pool, async (tx) => {
        const d = await docOuErro(tx, a.lojaId, id, true)
        if (d.status === 'aprovado') throw conflito('documento_ja_aprovado', 'Este documento ja foi aprovado')
        if (d.status !== 'rascunho') {
          throw regraNegocio('documento_nao_aprovavel', 'So e possivel aprovar um rascunho')
        }
        exigirEstavel(d.titulo, d.conteudo)
        if (d.substitui_id) {
          const anterior = await repo.obterDocumento(tx, a.lojaId, d.substitui_id, true)
          if (anterior && anterior.status === 'aprovado') await repo.marcarArquivado(tx, a.lojaId, anterior.id)
        }
        await repo.marcarAprovado(tx, a.lojaId, id, a.userId)
        await repo.promoverFeedbackDoDocumento(tx, a.lojaId, id)
        await repo.auditar(tx, a.lojaId, 'conhecimento.documento_aprovado', 'documento', id, {
          user_id: a.userId,
          versao: d.versao,
          substitui_id: d.substitui_id,
        })
        return docOuErro(tx, a.lojaId, id)
      })
    },

    async arquivar(a: Ator, id: string) {
      return comTransacao(pool, async (tx) => {
        const d = await docOuErro(tx, a.lojaId, id, true)
        if (d.status === 'arquivado') throw conflito('documento_ja_arquivado', 'Este documento ja esta arquivado')
        await repo.marcarArquivado(tx, a.lojaId, id)
        await repo.auditar(tx, a.lojaId, 'conhecimento.documento_arquivado', 'documento', id, {
          user_id: a.userId,
          estava: d.status,
        })
        return docOuErro(tx, a.lojaId, id)
      })
    },

    // ------------------------------------------------------------ golden set
    async listarAvaliacoes(a: Ator, f: { ativo?: 'true' | 'false' | undefined; limite: number }) {
      const ativo = f.ativo === undefined ? undefined : f.ativo === 'true'
      return { itens: await repo.listarAvaliacoes(pool, a.lojaId, { ativo, limite: f.limite }) }
    },

    async criarAvaliacao(
      a: Ator,
      e: {
        pergunta: string
        resposta_esperada?: string | null | undefined
        docs_esperados: string[]
        tipo?: TipoDoc | null | undefined
      },
    ) {
      exigirSemSensivel(e.pergunta, e.resposta_esperada ?? '')
      return comTransacao(pool, async (tx) => {
        await exigirDocsDaLoja(tx, a.lojaId, e.docs_esperados)
        const id = await repo.inserirAvaliacao(tx, a.lojaId, {
          pergunta: e.pergunta,
          resposta: e.resposta_esperada ?? null,
          docs: [...new Set(e.docs_esperados)],
          tipo: e.tipo ?? null,
        })
        await repo.auditar(tx, a.lojaId, 'conhecimento.avaliacao_alterada', 'base_avaliacao', id, {
          user_id: a.userId,
          acao: 'criada',
        })
        return (await repo.obterAvaliacao(tx, a.lojaId, id))!
      })
    },

    async atualizarAvaliacao(
      a: Ator,
      id: string,
      p: {
        pergunta?: string | undefined
        resposta_esperada?: string | null | undefined
        docs_esperados?: string[] | undefined
        tipo?: TipoDoc | null | undefined
        ativo?: boolean | undefined
      },
    ) {
      return comTransacao(pool, async (tx) => {
        const atual = await repo.obterAvaliacao(tx, a.lojaId, id)
        if (!atual) throw naoEncontrado('Caso de avaliacao nao encontrado')
        const novo: repo.AvaliacaoRow = {
          ...atual,
          pergunta: p.pergunta ?? atual.pergunta,
          resposta_esperada: p.resposta_esperada === undefined ? atual.resposta_esperada : p.resposta_esperada,
          docs_esperados: p.docs_esperados ? [...new Set(p.docs_esperados)] : atual.docs_esperados,
          tipo: p.tipo === undefined ? atual.tipo : p.tipo,
          ativo: p.ativo ?? atual.ativo,
        }
        exigirSemSensivel(novo.pergunta, novo.resposta_esperada ?? '')
        if (p.docs_esperados) await exigirDocsDaLoja(tx, a.lojaId, novo.docs_esperados)
        await repo.gravarAvaliacao(tx, a.lojaId, novo)
        await repo.auditar(tx, a.lojaId, 'conhecimento.avaliacao_alterada', 'base_avaliacao', id, {
          user_id: a.userId,
          acao: 'atualizada',
        })
        return (await repo.obterAvaliacao(tx, a.lojaId, id))!
      })
    },

    // ------------------------------------------------------------ feedback
    async listarFeedback(a: Ator, f: { status?: string | undefined; limite: number }) {
      return { itens: await repo.listarFeedback(pool, a.lojaId, f) }
    },

    async triar(a: Ator, id: string) {
      return transicionar(pool, a, id, ['novo'], 'triado')
    },

    async descartar(a: Ator, id: string) {
      return transicionar(pool, a, id, ['novo', 'triado'], 'descartado')
    },

    /** triado -> promovido: o dono escreve o documento (rascunho `realimentado`, com a fonte). */
    async promover(a: Ator, id: string, e: { tipo: TipoDoc; titulo: string; conteudo: string }) {
      exigirEstavel(e.titulo, e.conteudo)
      return comTransacao(pool, async (tx) => {
        const f = await repo.obterFeedback(tx, a.lojaId, id, true)
        if (!f) throw naoEncontrado('Sugestao nao encontrada')
        if (f.status !== 'triado') {
          throw regraNegocio('feedback_nao_triado', 'Tria a sugestao antes de promover')
        }
        const docId = await repo.inserirDocumento(tx, a.lojaId, {
          ...e,
          origem: 'realimentado',
          fonteConversaId: f.conversa_id,
          fonteMensagemId: f.mensagem_id,
          userId: a.userId,
        })
        await repo.mudarStatusFeedback(tx, a.lojaId, id, 'promovido', docId)
        await repo.auditar(tx, a.lojaId, 'conhecimento.feedback_promovido', 'rag_feedback', id, {
          user_id: a.userId,
          documento_id: docId,
        })
        return {
          feedback: (await repo.obterFeedback(tx, a.lojaId, id))!,
          documento: await docOuErro(tx, a.lojaId, docId),
        }
      })
    },
  }
}

async function exigirDocsDaLoja(exec: Pick<Pool, 'query'>, lojaId: string, ids: string[]): Promise<void> {
  const unicos = [...new Set(ids)]
  const da = await repo.idsDaLoja(exec, lojaId, unicos)
  if (unicos.some((i) => !da.has(i))) {
    throw regraNegocio('documento_invalido', 'Algum documento esperado nao existe nesta loja')
  }
}

async function transicionar(
  pool: Pool,
  a: Ator,
  id: string,
  de: repo.FeedbackRow['status'][],
  para: repo.FeedbackRow['status'],
) {
  return comTransacao(pool, async (tx) => {
    const f = await repo.obterFeedback(tx, a.lojaId, id, true)
    if (!f) throw naoEncontrado('Sugestao nao encontrada')
    if (!de.includes(f.status)) {
      throw regraNegocio('transicao_invalida', `Sugestao em "${f.status}" nao pode ir para "${para}"`)
    }
    await repo.mudarStatusFeedback(tx, a.lojaId, id, para)
    await repo.auditar(tx, a.lojaId, `conhecimento.feedback_${para}`, 'rag_feedback', id, { user_id: a.userId })
    return (await repo.obterFeedback(tx, a.lojaId, id))!
  })
}
