import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod'
import { ErroBanco } from '@whaviso/shared/db'

/** Erro de negocio com codigo estavel; vira `{error:{code,message}}` na resposta. */
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

export class NaoEncontrado extends HttpError {
  constructor(message = 'Recurso nao encontrado', code = 'nao_encontrado') {
    super(404, code, message)
  }
}
export class Proibido extends HttpError {
  constructor(message = 'Sem permissao para esta acao', code = 'proibido') {
    super(403, code, message)
  }
}
export class Invalido extends HttpError {
  constructor(message = 'Entrada invalida', code = 'entrada_invalida') {
    super(422, code, message)
  }
}
export class Conflito extends HttpError {
  constructor(message = 'Conflito com o estado atual', code = 'conflito') {
    super(409, code, message)
  }
}
export class Interno extends HttpError {
  constructor(message = 'Erro interno', code = 'erro_interno') {
    super(500, code, message)
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

function enviar(reply: FastifyReply, status: number, code: string, message: string): void {
  void reply.status(status).send({ error: { code, message } })
}

/** Erro de banco traduzido -> resposta generica (nunca expoe constraint nem detalhe do pg). */
function doBanco(reply: FastifyReply, erro: ErroBanco): void {
  switch (erro.tipo) {
    case 'unique':
      return enviar(reply, 409, 'conflito', 'Registro ja existe')
    case 'fk':
      return enviar(reply, 409, 'referencia_invalida', 'Referencia inexistente ou em uso')
    case 'check':
    case 'nao_nulo':
      return enviar(reply, 422, 'entrada_invalida', 'Dado fora das regras permitidas')
    case 'serializacao':
      return enviar(reply, 409, 'conflito_concorrencia', 'Conflito de concorrencia; tente de novo')
    default:
      return enviar(reply, 503, 'indisponivel', 'Servico temporariamente indisponivel')
  }
}

/** 404 de rota inexistente no envelope padrao. */
export function tratadorNaoEncontrado(_req: FastifyRequest, reply: FastifyReply): void {
  enviar(reply, 404, 'nao_encontrado', 'Recurso nao encontrado')
}

export function tratadorDeErros(
  erro: FastifyError,
  req: FastifyRequest,
  reply: FastifyReply,
): void {
  if (erro instanceof HttpError) {
    enviar(reply, erro.statusCode, erro.code, erro.message)
    return
  }

  if (erro instanceof ErroBanco) {
    doBanco(reply, erro)
    return
  }

  // Validacao Zod na borda (SEC-081): so caminhos dos campos, sem schema interno nem valores.
  if (hasZodFastifySchemaValidationErrors(erro)) {
    const campos = [...new Set(erro.validation.map((v) => v.instancePath.replace(/^\//, '').replaceAll('/', '.') || '(corpo)'))]
    enviar(reply, 400, 'entrada_invalida', `Entrada invalida: ${campos.join(', ')}`)
    return
  }

  if (erro.statusCode === 429) {
    enviar(reply, 429, 'limite_excedido', 'Muitas requisicoes; tente em instantes')
    return
  }
  if (erro.statusCode === 413) {
    enviar(reply, 413, 'payload_grande', 'Corpo da requisicao grande demais')
    return
  }
  // Outros 4xx do Fastify (JSON malformado, content-type invalido...): generico, sem eco.
  if (erro.statusCode && erro.statusCode >= 400 && erro.statusCode < 500) {
    enviar(reply, erro.statusCode, 'requisicao_invalida', 'Requisicao invalida')
    return
  }

  // Loga so message/code/name, nunca o objeto inteiro: erros do pg carregam props proprias
  // (detail, where...) que podem ecoar dado sensivel. A resposta ao cliente segue generica.
  req.log.error(
    { err_message: erro.message, err_code: erro.code, err_name: erro.name },
    'erro nao tratado',
  )
  enviar(reply, 500, 'erro_interno', 'Erro interno')
}
