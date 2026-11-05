// Regra do modulo `suporte`. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
// Dono das tabelas `chamados_suporte`/`chamados_suporte_mensagens` (via repo). A parte de acesso
// assistido (grants) e DELEGADA ao kernel shared/acesso_suporte: este modulo nao toca as tabelas
// de acesso direto (fronteira feature-first). Nenhum dado sensivel/PII vai para log.
//
// Transicoes de status do chamado:
//   abrir                -> 'aberto'
//   loja manda mensagem  -> 'aberto'     (volta para a fila, aguardando a equipe)
//   operador responde    -> 'respondido'
//   loja encerra (PATCH) -> 'resolvido'
import { comTransacao, type Pool } from '@whaviso/shared/db'
import type {
  AcessoSuporte, ChamadoFicha, ChamadoMensagem, ChamadoResumo, ListaAcessos, ListaChamados,
  NovoAcesso, NovoChamado, SuporteChamadosQuery,
} from '@whaviso/shared/contracts'
import { servicoAcessoSuporte } from '../../shared/acesso_suporte'
import { naoEncontrado } from '../../shared/http_errors'
import { codificarCursor, decodificarCursor } from './cursor'
import * as repo from './repo'

export function criarServicoSuporte(pool: Pool) {
  return {
    // ========================================================================= LOJA (chamados)
    async listarChamadosLoja(lojaId: string): Promise<ListaChamados> {
      return { itens: await repo.listarPorLoja(pool, lojaId) }
    },

    async abrirChamado(lojaId: string, userId: string, d: NovoChamado): Promise<ChamadoResumo> {
      return comTransacao(pool, async (tx) => {
        const chamado = await repo.inserirChamado(tx, {
          lojaId, assunto: d.assunto, criadoPor: userId,
        })
        await repo.inserirMensagem(tx, {
          chamadoId: chamado.id, autorTipo: 'loja', autorUserId: userId, texto: d.mensagem,
        })
        return chamado
      })
    },

    async fichaLoja(lojaId: string, chamadoId: string): Promise<ChamadoFicha> {
      const chamado = await repo.buscarPorIdNaLoja(pool, chamadoId, lojaId)
      if (!chamado) throw naoEncontrado('Chamado nao encontrado')
      return { chamado, mensagens: await repo.mensagensDoChamado(pool, chamadoId) }
    },

    async mensagemLoja(
      lojaId: string, chamadoId: string, userId: string, texto: string,
    ): Promise<ChamadoMensagem> {
      return comTransacao(pool, async (tx) => {
        const chamado = await repo.buscarPorIdNaLoja(tx, chamadoId, lojaId)
        if (!chamado) throw naoEncontrado('Chamado nao encontrado')
        const msg = await repo.inserirMensagem(tx, {
          chamadoId, autorTipo: 'loja', autorUserId: userId, texto,
        })
        // Loja respondeu: volta para a fila da equipe.
        await repo.atualizarStatus(tx, chamadoId, 'aberto', lojaId)
        return msg
      })
    },

    async resolverLoja(lojaId: string, chamadoId: string): Promise<ChamadoResumo> {
      const atualizado = await repo.atualizarStatus(pool, chamadoId, 'resolvido', lojaId)
      if (!atualizado) throw naoEncontrado('Chamado nao encontrado')
      return atualizado
    },

    // ========================================================================= LOJA (acessos)
    async listarAcessosLoja(lojaId: string): Promise<ListaAcessos> {
      return { itens: await servicoAcessoSuporte.listarPorLoja(pool, lojaId) }
    },

    async concederAcesso(lojaId: string, userId: string, d: NovoAcesso): Promise<AcessoSuporte> {
      // chamado_id, se informado, tem que ser um chamado DESTA loja (consentimento ancorado nela).
      if (d.chamado_id) {
        const chamado = await repo.buscarPorIdNaLoja(pool, d.chamado_id, lojaId)
        if (!chamado) throw naoEncontrado('Chamado nao encontrado')
      }
      const expiraEm =
        d.duracao_horas !== undefined
          ? new Date(Date.now() + d.duracao_horas * 60 * 60 * 1000).toISOString()
          : d.expira_em!
      return servicoAcessoSuporte.conceder(pool, {
        lojaId, concedidoPor: userId, motivo: d.motivo ?? null, expiraEm, chamadoId: d.chamado_id ?? null,
      })
    },

    async revogarAcesso(lojaId: string, acessoId: string, userId: string): Promise<AcessoSuporte> {
      return servicoAcessoSuporte.revogar(pool, { id: acessoId, lojaId, revogadoPor: userId })
    },

    // ======================================================================= CONSOLE (operador)
    async filaChamados(q: SuporteChamadosQuery) {
      const apos = q.cursor ? decodificarCursor(q.cursor) : null
      const linhas = await repo.listarFila(pool, {
        status: q.status ?? null, apos, limite: q.limite,
      })
      const pagina = linhas.slice(0, q.limite)
      const ultima = pagina[pagina.length - 1]
      const proximoCursor =
        linhas.length > q.limite && ultima
          ? codificarCursor({ instante: ultima.atualizado_em, id: ultima.id })
          : null
      return { itens: pagina, proximoCursor }
    },

    async fichaConsole(chamadoId: string): Promise<ChamadoFicha> {
      const chamado = await repo.buscarPorId(pool, chamadoId)
      if (!chamado) throw naoEncontrado('Chamado nao encontrado')
      return { chamado, mensagens: await repo.mensagensDoChamado(pool, chamadoId) }
    },

    async mensagemConsole(
      chamadoId: string, userId: string, texto: string,
    ): Promise<ChamadoMensagem> {
      return comTransacao(pool, async (tx) => {
        const chamado = await repo.buscarPorId(tx, chamadoId)
        if (!chamado) throw naoEncontrado('Chamado nao encontrado')
        const msg = await repo.inserirMensagem(tx, {
          chamadoId, autorTipo: 'operador', autorUserId: userId, texto,
        })
        // Operador respondeu: chamado passa a 'respondido'.
        await repo.atualizarStatus(tx, chamadoId, 'respondido', null)
        return msg
      })
    },

    /** Grants de uma loja, para o operador ver se ha consentimento ativo (nunca concede/revoga). */
    async acessosDaLoja(lojaId: string): Promise<ListaAcessos> {
      return { itens: await servicoAcessoSuporte.listarPorLoja(pool, lojaId) }
    },
  }
}
