// Contratos de borda do modulo clientes (fonte unica; o codegen reemite para o front).
// Schemas Zod estritos (SEC-081). Telefone em claro so existe na ENTRADA (cadastro/busca)
// e em TelefoneRevelarSaida.
import { z } from 'zod'
import { UuidSchema } from './primitivos'

const Uuid = UuidSchema
// Saida de data como string nao vazia (serializacao do banco; nao forca ISO estrito aqui).
const DataHora = z.string().min(1)

export const ClienteBuscaEntrada = z.strictObject({
  q: z.string().trim().min(1).max(100).optional(),
  cursor: z.string().min(1).max(512).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(20),
})

export const ClienteBuscaTelefoneEntrada = z.strictObject({
  telefone: z.string().trim().min(8).max(30),
  cursor: z.string().min(1).max(512).optional(),
  limite: z.number().int().min(1).max(100).default(20),
})

export const ClienteCriarEntrada = z.strictObject({
  telefone: z.string().trim().min(8).max(30),
  nome: z.string().trim().min(1).max(120).optional(),
})

export const ClienteAtualizarEntrada = z.strictObject({
  nome: z.string().trim().min(1).max(120),
})

export const ClienteListaItem = z.strictObject({
  id: Uuid,
  nome: z.string().nullable(),
  telefone_mascarado: z.string().nullable(),
  pedidos_total: z.number().int(),
  ultima_atividade: DataHora,
})
export const ClienteListaSaida = z.strictObject({
  itens: z.array(ClienteListaItem),
  proximoCursor: z.string().nullable(),
})

const UF = z.string().trim().length(2).regex(/^[A-Za-z]{2}$/).transform((v) => v.toUpperCase())
const CEP = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ''))
  .pipe(z.string().length(8))
const texto = (max: number) => z.string().trim().min(1).max(max)

export const EnderecoCampos = {
  apelido: texto(60),
  logradouro: texto(200),
  numero: texto(20),
  complemento: texto(100),
  bairro: texto(100),
  cidade: texto(100),
  uf: UF,
  cep: CEP,
  referencia: texto(200),
}

export const EnderecoEntrada = z.strictObject({
  logradouro: EnderecoCampos.logradouro,
  apelido: EnderecoCampos.apelido.optional(),
  numero: EnderecoCampos.numero.optional(),
  complemento: EnderecoCampos.complemento.optional(),
  bairro: EnderecoCampos.bairro.optional(),
  cidade: EnderecoCampos.cidade.optional(),
  uf: EnderecoCampos.uf.optional(),
  cep: EnderecoCampos.cep.optional(),
  referencia: EnderecoCampos.referencia.optional(),
})

/** PATCH parcial: campo opcional pode ser limpo com null; logradouro nao. */
export const EnderecoAtualizarEntrada = z
  .strictObject({
    logradouro: EnderecoCampos.logradouro.optional(),
    apelido: EnderecoCampos.apelido.nullable().optional(),
    numero: EnderecoCampos.numero.nullable().optional(),
    complemento: EnderecoCampos.complemento.nullable().optional(),
    bairro: EnderecoCampos.bairro.nullable().optional(),
    cidade: EnderecoCampos.cidade.nullable().optional(),
    uf: EnderecoCampos.uf.nullable().optional(),
    cep: EnderecoCampos.cep.nullable().optional(),
    referencia: EnderecoCampos.referencia.nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'informe ao menos um campo' })

export const EnderecoSaida = z.strictObject({
  id: Uuid,
  cliente_id: Uuid,
  apelido: z.string().nullable(),
  logradouro: z.string(),
  numero: z.string().nullable(),
  complemento: z.string().nullable(),
  bairro: z.string().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  cep: z.string().nullable(),
  referencia: z.string().nullable(),
  ultimo_uso_em: DataHora.nullable(),
  ativo: z.boolean(),
  criado_em: DataHora,
})
export const EnderecoListaSaida = z.strictObject({ itens: z.array(EnderecoSaida) })
export const UltimoEnderecoSaida = z.strictObject({ endereco: EnderecoSaida.nullable() })

export const ClienteDetalheSaida = z.strictObject({
  id: Uuid,
  nome: z.string().nullable(),
  telefone_mascarado: z.string().nullable(),
  criado_em: DataHora,
  enderecos: z.array(EnderecoSaida),
  resumo_pedidos: z.strictObject({
    total: z.number().int(),
    ultimo_pedido_em: DataHora.nullable(),
    total_gasto_centavos: z.number().int(),
  }),
})

/** Cliente sem agregados (resposta de criar/editar). */
export const ClienteSaida = z.strictObject({
  id: Uuid,
  nome: z.string().nullable(),
  telefone_mascarado: z.string().nullable(),
  criado_em: DataHora,
})

export const TelefoneRevelarSaida = z.strictObject({ telefone: z.string() })

export type ClienteBuscaTelefone = z.infer<typeof ClienteBuscaTelefoneEntrada>
export type ClienteBusca = z.infer<typeof ClienteBuscaEntrada>
export type EnderecoNovo = z.infer<typeof EnderecoEntrada>
export type EnderecoPatch = z.infer<typeof EnderecoAtualizarEntrada>
export type EnderecoDto = z.infer<typeof EnderecoSaida>

/** 409 do cadastro: envelope padrao + id do cliente existente. */
export const ClienteConflitoSaida = z.strictObject({
  error: z.strictObject({ code: z.string(), message: z.string() }),
  cliente_id: Uuid.nullable(),
})
