// Regra do modulo. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
import { z } from 'zod'
import type { Pool } from '@whaviso/shared/db'
import { HttpError, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import * as repo from './repo'
import type { AgendamentoDefinir, AgendamentosBusca } from './schemas'

export interface Ator {
  lojaId: string
  userId: string
}

/** Horizonte maximo de agendamento (dias). */
export const HORIZONTE_MAX_DIAS = 30

const CursorSchema = z.tuple([z.string().min(1).max(40), z.uuid()])
const codificarCursor = (ts: string, id: string) =>
  Buffer.from(JSON.stringify([ts, id])).toString('base64url')
function decodificarCursor(c: string): { ts: string; id: string } {
  try {
    const [ts, id] = CursorSchema.parse(JSON.parse(Buffer.from(c, 'base64url').toString('utf8')))
    if (Number.isNaN(Date.parse(ts))) throw new Error('ts')
    return { ts, id }
  } catch {
    throw new HttpError(400, 'cursor_invalido', 'Cursor invalido')
  }
}

export function criarServicoAgendamento(pool: Pool, agora: () => Date = () => new Date()) {
  async function pedidoAgendavel(a: Ator, pedidoId: string) {
    const p = await repo.obterPedido(pool, a.lojaId, pedidoId)
    if (!p) throw naoEncontrado('Pedido nao encontrado')
    if (p.status !== 'rascunho' && p.status !== 'novo') {
      throw regraNegocio('pedido_nao_agendavel', 'So pedido ainda nao iniciado pode ser agendado')
    }
    return p
  }

  return {
    async definir(a: Ator, pedidoId: string, entrada: AgendamentoDefinir) {
      const quando = new Date(entrada.agendado_para)
      const t = agora().getTime()
      if (quando.getTime() <= t) {
        throw regraNegocio('agendamento_no_passado', 'O horario agendado precisa ser futuro')
      }
      if (quando.getTime() > t + HORIZONTE_MAX_DIAS * 86_400_000) {
        throw regraNegocio('agendamento_muito_distante', `Agende em ate ${HORIZONTE_MAX_DIAS} dias`)
      }
      await pedidoAgendavel(a, pedidoId)
      const iso = quando.toISOString()
      if (!(await repo.gravar(pool, a.lojaId, pedidoId, iso))) {
        throw regraNegocio('pedido_nao_agendavel', 'So pedido ainda nao iniciado pode ser agendado')
      }
      await repo.registrarEvento(pool, {
        lojaId: a.lojaId, pedidoId, userId: a.userId, tipo: 'pedido.agendado', agendadoPara: iso,
      })
      return (await repo.obter(pool, a.lojaId, pedidoId))!
    },

    /** Limpa o agendamento: o pedido volta a ser imediato. Idempotente. */
    async limpar(a: Ator, pedidoId: string) {
      const p = await pedidoAgendavel(a, pedidoId)
      if (p.agendado_para !== null) {
        if (!(await repo.gravar(pool, a.lojaId, pedidoId, null))) {
          throw regraNegocio('pedido_nao_agendavel', 'So pedido ainda nao iniciado pode ser alterado')
        }
        await repo.registrarEvento(pool, {
          lojaId: a.lojaId, pedidoId, userId: a.userId, tipo: 'pedido.agendamento_removido', agendadoPara: null,
        })
      }
      return (await repo.obter(pool, a.lojaId, pedidoId))!
    },

    async detalhe(a: Ator, pedidoId: string) {
      const dto = await repo.obter(pool, a.lojaId, pedidoId)
      if (!dto) throw naoEncontrado('Pedido nao encontrado')
      return dto
    },

    async listar(a: Ator, q: AgendamentosBusca) {
      const linhas = await repo.listar(pool, a.lojaId, {
        antecedenciaMin: q.antecedencia_min,
        de: q.de,
        ate: q.ate,
        janela: q.janela,
        cursor: q.cursor ? decodificarCursor(q.cursor) : undefined,
        limite: q.limite,
      })
      const itens = linhas.slice(0, q.limite)
      const ultima = itens[itens.length - 1]
      return {
        itens,
        proximoCursor:
          linhas.length > q.limite && ultima?.agendado_para
            ? codificarCursor(ultima.agendado_para, ultima.pedido_id)
            : null,
      }
    },
  }
}

export type ServicoAgendamento = ReturnType<typeof criarServicoAgendamento>
