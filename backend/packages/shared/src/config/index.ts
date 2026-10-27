import type { z } from 'zod'

export * from './schemas'

/** Erro de configuracao: lista so NOMES de variaveis e a regra violada, nunca valores. */
export class ErroConfig extends Error {
  constructor(public readonly problemas: string[]) {
    super(`Variaveis de ambiente invalidas:\n${problemas.map((p) => `  - ${p}`).join('\n')}`)
    this.name = 'ErroConfig'
  }
}

/**
 * Valida `fonte` (padrao process.env) contra o schema do servico. Lanca ErroConfig com a
 * lista de variaveis ausentes/invalidas. A mensagem nunca ecoa o valor recebido.
 */
export function validarEnv<S extends z.ZodType>(
  schema: S,
  fonte: Record<string, string | undefined> = process.env,
): z.infer<S> {
  const resultado = schema.safeParse(fonte)
  if (resultado.success) return resultado.data
  const problemas = resultado.error.issues.map((i) => {
    const nome = i.path.join('.') || '(raiz)'
    const ausente = fonte[nome] === undefined
    return `${nome}: ${ausente ? 'ausente' : 'invalida'} (${i.message})`
  })
  throw new ErroConfig(problemas)
}

/**
 * Valida process.env contra o schema do servico. Crash imediato no boot
 * se algo faltar/estiver invalido: nunca subir meio-configurado.
 */
export function parseEnv<S extends z.ZodType>(schema: S): z.infer<S> {
  try {
    return validarEnv(schema)
  } catch (erro) {
    if (erro instanceof ErroConfig) {
      console.error(erro.message)
      process.exit(1)
    }
    throw erro
  }
}
