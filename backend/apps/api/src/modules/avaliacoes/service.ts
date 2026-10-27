// Regra do modulo. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
// Nenhum dado pessoal (nome, comentario) e passado a log.
import { z } from 'zod'
import type { Pool } from '@whaviso/shared/db'
import { HttpError, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import * as repo from './repo'
import type { AvaliacaoNova, AvaliacoesBusca } from './schemas'

export interface Ator {
  lojaId: string
  userId: string
}

const CursorSchema = z.tuple([z.string().min(1).max(40), z.uuid()])

function codificarCursor(ts: string, id: string): string {
  return Buffer.from(JSON.stringify([ts, id])).toString('base64url')
}
function decodificarCursor(c: string): { ts: string; id: string } {
  try {
    const [ts, id] = CursorSchema.parse(JSON.parse(Buffer.from(c, 'base64url').toString('utf8')))
    if (Number.isNaN(Date.parse(ts))) throw new Error('ts')
    return { ts, id }
  } catch {
    throw new HttpError(400, 'cursor_invalido', 'Cursor invalido')
  }
}

export function criarServicoAvaliacoes(pool: Pool) {
  return {
    /**
     * Registro interno da avaliacao (a ponte pela conversa do consumidor e uma integracao
     * posterior). Regras: pedido da loja, entregue, com cliente, uma avaliacao por pedido.
     */
    async registrar(a: Ator, entrada: AvaliacaoNova) {
      const pedido = await repo.obterPedido(pool, a.lojaId, entrada.pedido_id)
      if (!pedido) throw naoEncontrado('Pedido nao encontrado')
      if (pedido.status !== 'entregue') {
        throw regraNegocio('pedido_nao_entregue', 'So pedido entregue pode ser avaliado')
      }
      if (!pedido.cliente_id) {
        throw regraNegocio('pedido_sem_cliente', 'Pedido sem cliente nao pode ser avaliado')
      }
      const id = await repo.inserir(pool, {
        lojaId: a.lojaId,
        pedidoId: pedido.id,
        clienteId: pedido.cliente_id,
        nota: entrada.nota,
        comentario: entrada.comentario ?? null,
      })
      if (!id) throw regraNegocio('avaliacao_ja_registrada', 'Este pedido ja foi avaliado')
      await repo.registrarEvento(pool, { lojaId: a.lojaId, entidadeId: id, userId: a.userId, nota: entrada.nota })
      const dto = await repo.obter(pool, a.lojaId, id)
      return dto!
    },

    async listar(a: Ator, q: AvaliacoesBusca) {
      const linhas = await repo.listar(pool, a.lojaId, {
        nota: q.nota,
        cursor: q.cursor ? decodificarCursor(q.cursor) : undefined,
        limite: q.limite,
      })
      const itens = linhas.slice(0, q.limite)
      const ultima = itens[itens.length - 1]
      return {
        itens,
        proximoCursor: linhas.length > q.limite && ultima ? codificarCursor(ultima.criado_em, ultima.id) : null,
      }
    },

    async resumo(a: Ator) {
      return repo.resumo(pool, a.lojaId)
    },

    async detalhe(a: Ator, id: string) {
      const dto = await repo.obter(pool, a.lojaId, id)
      if (!dto) throw naoEncontrado('Avaliacao nao encontrada')
      return dto
    },
  }
}

export type ServicoAvaliacoes = ReturnType<typeof criarServicoAvaliacoes>
