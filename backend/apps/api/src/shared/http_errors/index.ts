import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod'

/** Erro de negócio com código estável; vira `{error:{code,message}}` na resposta. */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export const naoAutorizado = (msg = 'Autenticação necessária') =>
  new HttpError(401, 'nao_autorizado', msg)
export const proibido = (msg = 'Sem permissão para esta ação') =>
  new HttpError(403, 'proibido', msg)
export const naoEncontrado = (msg = 'Recurso não encontrado') =>
  new HttpError(404, 'nao_encontrado', msg)
export const conflito = (code: string, msg: string) => new HttpError(409, code, msg)
export const regraNegocio = (code: string, msg: string) => new HttpError(422, code, msg)

export function tratadorDeErros(
  erro: FastifyError,
  req: FastifyRequest,
  reply: FastifyReply,
): void {
  if (erro instanceof HttpError) {
    void reply.status(erro.statusCode).send({
      error: { code: erro.code, message: erro.message },
    })
    return
  }

  if (hasZodFastifySchemaValidationErrors(erro)) {
    const detalhe = erro.validation
      .map((v) => `${v.instancePath} ${v.message ?? ''}`.trim())
      .join('; ')
    void reply.status(400).send({
      error: { code: 'entrada_invalida', message: detalhe || 'Entrada inválida' },
    })
    return
  }

  // Rate limit do @fastify/rate-limit
  if (erro.statusCode === 429) {
    void reply.status(429).send({
      error: { code: 'limite_excedido', message: 'Muitas requisições; tente em instantes' },
    })
    return
  }

  req.log.error({ err: erro }, 'erro não tratado')
  void reply.status(500).send({
    error: { code: 'erro_interno', message: 'Erro interno' },
  })
}
