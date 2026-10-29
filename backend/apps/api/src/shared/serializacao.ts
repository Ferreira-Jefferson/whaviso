import fastJson from 'fast-json-stringify'
import { z } from 'zod'
import { serializerCompiler } from 'fastify-type-provider-zod'

type Entrada = Parameters<typeof serializerCompiler>[0]
type Serializador = ReturnType<typeof serializerCompiler>

const cache = new WeakMap<object, (data: unknown) => string>()

/**
 * Serializer de resposta baseado em fast-json-stringify (mais rapido em listas grandes).
 * Emite SO os campos declarados no schema, preservando o whitelist de PII do serializer
 * antigo. Se a conversao ou a compilacao falhar para um schema, cai no serializer original
 * do pacote para aquela rota (nenhuma rota quebra).
 */
export function serializerCompilerRapido(entrada: Entrada): Serializador {
  try {
    const maybe = entrada.schema as unknown
    const schema =
      maybe instanceof z.ZodType
        ? maybe
        : ((maybe as { properties?: unknown } | null)?.properties as unknown)
    if (!(schema instanceof z.ZodType)) throw new Error('schema nao e zod')
    let stringify = cache.get(schema)
    if (!stringify) {
      const jsonSchema = z.toJSONSchema(schema, {
        io: 'output',
        unrepresentable: 'any',
        cycles: 'ref',
        reused: 'inline',
      })
      stringify = fastJson(jsonSchema as Parameters<typeof fastJson>[0]) as (
        data: unknown,
      ) => string
      cache.set(schema, stringify)
    }
    const fn = stringify
    return (data: unknown) => fn(data)
  } catch {
    return serializerCompiler(entrada)
  }
}
