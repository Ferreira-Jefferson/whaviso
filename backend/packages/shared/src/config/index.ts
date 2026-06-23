import type { z } from 'zod'

/**
 * Valida process.env contra o schema do serviço. Crash imediato no boot
 * se algo faltar/estiver inválido: nunca subir meio-configurado.
 */
export function parseEnv<S extends z.ZodType>(schema: S): z.infer<S> {
  const resultado = schema.safeParse(process.env)
  if (!resultado.success) {
    const detalhes = resultado.error.issues
      .map((i) => `  - ${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('\n')
    console.error(`Variáveis de ambiente inválidas:\n${detalhes}`)
    process.exit(1)
  }
  return resultado.data
}
