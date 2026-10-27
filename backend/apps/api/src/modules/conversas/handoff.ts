// Handoff manual (human-in-the-loop): um humano ASSUME a conversa que a IA conduzia
// (ia->humano) ou DEVOLVE para a automacao (humano->ia). Dono do estado da conversa e o
// proprio modulo conversas. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
// NUNCA loga conteudo nem telefone (SEC-024): so ids e status.
import { comTransacao, notificar, type Pool } from '@whaviso/shared/db'
import { Invalido, NaoEncontrado } from '../../shared/http_errors'
import { membroDoUsuarioNaLoja } from './repo'
import { assumirConversa, devolverConversa, registrarEvento, travarConversa } from './repo_escrita'
import { proximoStatus, type AcaoHandoff } from './transicoes'
import type { ConversaHandoffSaida } from './schemas'
import type { StatusConversa } from '@whaviso/shared/contracts'

const naoAchou = () => new NaoEncontrado('Conversa nao encontrada', 'conversa_nao_encontrada')

/** Transicao de handoff fora das permitidas (ia->humano, humano->ia). 'encerrada' e terminal. */
function transicaoInvalida(acao: AcaoHandoff, atual: StatusConversa): Invalido {
  const msg =
    atual === 'encerrada'
      ? 'Conversa encerrada: o atendimento nao pode mais ser alterado'
      : acao === 'assumir'
        ? 'A conversa ja esta em atendimento humano'
        : 'A conversa ja esta com a automacao'
  return new Invalido(msg, 'transicao_invalida')
}

/**
 * Trava a conversa, valida a transicao, aplica, audita e emite o evento realtime.
 * A trava (FOR UPDATE) serializa a disputa: dois humanos assumindo = exatamente um vencedor,
 * o segundo encontra 'humano' e recebe 422.
 */
async function transicionar(
  pool: Pool,
  acao: AcaoHandoff,
  lojaId: string,
  conversaId: string,
  userId: string,
): Promise<ConversaHandoffSaida> {
  return comTransacao(pool, async (tx) => {
    const c = await travarConversa(tx, lojaId, conversaId)
    if (!c) throw naoAchou()
    const para = proximoStatus(acao, c.status)
    if (!para) throw transicaoInvalida(acao, c.status)

    if (acao === 'assumir') {
      const membroId = await membroDoUsuarioNaLoja(tx, userId, lojaId)
      await assumirConversa(tx, lojaId, conversaId, membroId)
    } else {
      await devolverConversa(tx, lojaId, conversaId)
    }

    await registrarEvento(tx, {
      lojaId,
      tipo: acao === 'assumir' ? 'conversa.handoff_assumido' : 'conversa.handoff_devolvido',
      conversaId,
      detalhes: { de: c.status, para },
    })
    // NOTIFY so sai no COMMIT; payload so referencia (ids + status), sem conteudo nem telefone.
    await notificar(tx, {
      tipo: 'conversa.handoff',
      loja_id: lojaId,
      payload: { conversa_id: conversaId, loja_id: lojaId, status: para },
    })
    return { id: conversaId, status: para }
  })
}

/** ia -> humano. Grava quem assumiu (membro da loja ativa). */
export async function assumir(
  pool: Pool,
  lojaId: string,
  conversaId: string,
  userId: string,
): Promise<ConversaHandoffSaida> {
  return transicionar(pool, 'assumir', lojaId, conversaId, userId)
}

/** humano -> ia. Limpa quem atendia. */
export async function devolver(
  pool: Pool,
  lojaId: string,
  conversaId: string,
): Promise<ConversaHandoffSaida> {
  return transicionar(pool, 'devolver', lojaId, conversaId, '')
}
