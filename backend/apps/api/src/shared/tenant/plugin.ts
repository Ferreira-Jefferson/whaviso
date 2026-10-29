// Plugin Fastify de escopo de loja (F3, etapa 7). Resolve o escopo do membro, fixa a
// loja ativa SO quando ela pertence ao conjunto resolvido, e expoe `request.escopo`.
//
// Regras adversariais:
//   - a loja ativa vem APENAS do header `x-loja-id` ou de um parametro de ROTA; NUNCA do
//     corpo, da query ou de um claim do token (SEC-002). loja_id forjado nesses canais
//     e simplesmente ignorado: o efetivo e sempre o conjunto de `membros`.
//   - loja ativa fora do escopo -> 404 (nao vaza existencia) e auditoria de negacao.
//   - leitura de escopo que falha -> FALHA FECHADA (503, nega), nunca segue sem escopo.
//
// Plugin PURO (`fastify-plugin`); F4 registra injetando o `LeitorEscopo` (e, opcional, um
// executor para a auditoria de negacao).
import fp from 'fastify-plugin'
import type {
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from 'fastify'
import type { EscopoLoja, PapelMembro } from '@whaviso/shared/contracts'
import { HttpError, naoAutorizado, naoEncontrado, proibido } from '../http_errors'
import { registrarEventoAcesso, type ExecutorAuditoria } from '../eventos_auth'
import type { LeitorEscopo } from './leitor_escopo'
import { ErroEscopoAmbiguo, montarEscopoLoja } from './escopo'
import { escopoTemPapel } from './consulta'
import type { Permissao } from './papeis'
import { operadorPermite, papelPermite } from './papeis'
import { definicaoDe } from './catalogo'
import { garantirGradeFresca } from './grade'

export interface OpcoesEscopoLoja {
  leitor: LeitorEscopo
  /** Executor para gravar a auditoria de negacao; opcional (sem ele, nao audita). */
  auditoria?: ExecutorAuditoria
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Escopo de loja resolvido; null ate `escopoLoja` rodar com sucesso. */
    escopo: EscopoLoja | null
  }
  interface FastifyInstance {
    escopoLoja: preHandlerHookHandler
    /** Guarda: exige que o papel na loja ativa esteja entre os informados. */
    exigirPapel: (...papeis: PapelMembro[]) => preHandlerHookHandler
    /** Guarda: exige uma permissao (tabela de papeis) na loja ativa. */
    exigirPermissao: (permissao: Permissao) => preHandlerHookHandler
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Le a loja solicitada apenas de header e parametro de rota. null se ausente/malformada. */
function lerLojaSolicitada(req: FastifyRequest): string | null {
  const header = req.headers['x-loja-id']
  const doHeader = Array.isArray(header) ? header[0] : header
  const params = (req.params ?? {}) as Record<string, unknown>
  const doParam = params['lojaId'] ?? params['loja_id']
  const bruto = doHeader ?? (typeof doParam === 'string' ? doParam : undefined)
  if (typeof bruto !== 'string' || !UUID_RE.test(bruto)) return null
  return bruto
}

const plugin: FastifyPluginAsync<OpcoesEscopoLoja> = async (app, opcoes) => {
  app.decorateRequest('escopo', null)

  app.decorate('escopoLoja', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = req.usuario?.user_id
    if (!userId) throw naoAutorizado()

    let vinculos
    try {
      vinculos = await opcoes.leitor.lojasDoUsuario(userId)
    } catch {
      // Falha fechada: sem escopo confiavel, nega (nunca "passa na duvida").
      throw new HttpError(503, 'escopo_indisponivel', 'Nao foi possivel resolver o escopo')
    }

    let escopo: EscopoLoja | null
    try {
      escopo = montarEscopoLoja(userId, vinculos)
    } catch (erro) {
      if (erro instanceof ErroEscopoAmbiguo) {
        await auditarNegacao(opcoes, userId, 'conta_ambigua')
        throw proibido('Escopo de conta ambiguo')
      }
      throw erro
    }

    if (!escopo) {
      await auditarNegacao(opcoes, userId, 'sem_vinculo_loja')
      throw proibido('Sem acesso a nenhuma loja')
    }

    const solicitada = lerLojaSolicitada(req)
    if (solicitada) {
      if (!escopo.loja_ids.includes(solicitada)) {
        await auditarNegacao(opcoes, userId, 'loja_fora_do_escopo')
        // 404 em vez de 403: nao confirma a existencia de uma loja de outra conta.
        throw naoEncontrado()
      }
      escopo = { ...escopo, loja_ativa: solicitada }
    }

    req.escopo = escopo
    reply.header('cache-control', 'no-store')
  })

  app.decorate('exigirPapel', (...papeis: PapelMembro[]) => {
    return async (req: FastifyRequest) => {
      const escopo = req.escopo
      if (!escopo || !escopo.loja_ativa) throw proibido('Loja ativa nao definida')
      if (!escopoTemPapel(escopo, papeis)) throw proibido()
    }
  })

  // Guarda central do motor de autorizacao. A chave decide o escopo: chave de CONSOLE resolve
  // o papel por `req.operador` (rodar depois de `escopoOperador`); chave de LOJA, pelo papel do
  // membro na loja ativa. Sempre le a grade (cache por processo, TTL + invalidacao ao salvar).
  app.decorate('exigirPermissao', (permissao: Permissao) => {
    const def = definicaoDe(permissao)
    if (!def) throw new Error(`permissao desconhecida: ${permissao}`) // erro de programacao, falha no boot
    return async (req: FastifyRequest) => {
      await garantirGradeFresca()
      if (def.escopo === 'console') {
        const operador = req.operador
        if (!operador) throw proibido('Escopo de operador ausente')
        if (!operadorPermite(operador.papel, permissao)) throw proibido()
        return
      }
      const escopo = req.escopo
      if (!escopo || !escopo.loja_ativa) throw proibido('Loja ativa nao definida')
      const papel = escopo.papel_por_loja[escopo.loja_ativa]
      if (!papel || !papelPermite(papel, permissao)) throw proibido()
    }
  })
}

async function auditarNegacao(
  opcoes: OpcoesEscopoLoja,
  userId: string,
  motivo: string,
): Promise<void> {
  if (!opcoes.auditoria) return
  await registrarEventoAcesso(opcoes.auditoria, 'login_negado', userId, motivo)
}

export const escopoLojaPlugin = fp(plugin, {
  name: 'whaviso-escopo-loja',
  dependencies: ['whaviso-autenticar'],
})
