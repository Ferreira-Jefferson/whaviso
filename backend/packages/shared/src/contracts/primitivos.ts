import { z } from 'zod'

// Primitivos de borda compartilhados por todos os contratos da api. Fonte única: o
// codegen reemite estes schemas para o front, então a validação é a mesma dos dois lados.

// Dinheiro sempre em centavos (inteiro não negativo). Nunca float: evita erro de ponto
// flutuante em soma de pedido. Teto defensivo (R$ 10 milhões) para barrar overflow/abuso.
export const Centavos = z
  .number()
  .int('valor em centavos deve ser inteiro')
  .nonnegative('valor em centavos não pode ser negativo')
  .max(1_000_000_000, 'valor acima do teto')

export const UuidSchema = z.uuid()

// Data/hora de borda: sempre ISO 8601 em UTC. A conversão para America/Sao_Paulo é
// responsabilidade de `@whaviso/shared/datas`; no contrato trafega UTC.
export const DataHoraIso = z.iso.datetime({ offset: true })

// Telefone E.164 só na ENTRADA; nunca é devolvido num DTO de resposta (PII).
export const TelefoneE164 = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'telefone deve estar em formato E.164 (ex.: +5511999998888)')

// Cursor opaco de paginação (base64url). O servidor codifica/decodifica; o cliente só repassa.
export const Cursor = z.string().min(1).max(512)

export const Paginacao = z
  .object({
    cursor: Cursor.optional(),
    limite: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
export type Paginacao = z.infer<typeof Paginacao>

// Envelope de erro da api: todo erro sai como `{ error: { code, message } }`.
export const ErroApi = z
  .object({
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict()
export type ErroApi = z.infer<typeof ErroApi>

/** Página genérica de resposta: itens + próximo cursor (null quando acabou). */
export function paginaDe<T extends z.ZodTypeAny>(item: T) {
  return z
    .object({
      itens: z.array(item),
      proximoCursor: z.string().nullable(),
    })
    .strict()
}
