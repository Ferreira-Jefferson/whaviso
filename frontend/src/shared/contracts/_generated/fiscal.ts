// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/fiscal.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Contratos de borda do modulo fiscal (emissao de NFC-e/NFS-e por emissor de terceiro).
// Schemas estritos. SEGREDO: a credencial do emissor e WRITE-ONLY: so a entrada a carrega; nenhuma
// saida a devolve (so `ultimos4`). A loja efetiva vem do escopo (x-loja-id), nunca do corpo.
import { z } from 'zod'
import { Centavos, DataHoraIso, UuidSchema } from './primitivos'

export const regimeFiscal = z.enum(['mei', 'simples_nacional', 'lucro_presumido', 'lucro_real'])
export type RegimeFiscalDto = z.infer<typeof regimeFiscal>

export const ambienteFiscal = z.enum(['homologacao', 'producao'])
export const tipoDocumentoFiscal = z.enum(['nfce', 'nfse'])
export type TipoDocumentoFiscal = z.infer<typeof tipoDocumentoFiscal>
export const statusDocumentoFiscal = z.enum(['pendente', 'emitido', 'erro'])
export type StatusDocumentoFiscal = z.infer<typeof statusDocumentoFiscal>

/** Credencial do emissor (write-only): tamanho plausivel, sem espacos, com trim. */
export const CredencialFiscal = z
  .string()
  .trim()
  .min(8, 'credencial curta demais')
  .max(2048, 'credencial longa demais')
  .refine((s) => !/\s/.test(s), { message: 'credencial nao pode conter espaco' })

const Cnpj = z.string().regex(/^[0-9]{14}$/, 'CNPJ: 14 digitos, so numeros')
const Serie = z.number().int().min(1).max(999)

// ---- Configuracao fiscal da loja -------------------------------------------------------------

/** PUT /fiscal/config: cadastro inicial ou troca da credencial. */
export const FiscalConfigEntrada = z.strictObject({
  credencial: CredencialFiscal,
  cnpj: Cnpj,
  regime: regimeFiscal,
  serie_nfce: Serie.default(1),
  serie_nfse: Serie.default(1),
  ambiente: ambienteFiscal.default('homologacao'),
})
export type FiscalConfigEntrada = z.infer<typeof FiscalConfigEntrada>

/** PATCH /fiscal/config: ajustes sem reenviar a credencial. */
export const FiscalConfigPatch = z
  .strictObject({
    cnpj: Cnpj.optional(),
    regime: regimeFiscal.optional(),
    serie_nfce: Serie.optional(),
    serie_nfse: Serie.optional(),
    ambiente: ambienteFiscal.optional(),
    ativo: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'nenhum campo informado' })
export type FiscalConfigPatch = z.infer<typeof FiscalConfigPatch>

/** Estado da configuracao (SEM credencial). Sem config: `configurada=false` e o resto nulo. */
export const FiscalConfigEstado = z.strictObject({
  configurada: z.boolean(),
  ativo: z.boolean(),
  cnpj: z.string().nullable(),
  regime: regimeFiscal.nullable(),
  serie_nfce: z.number().int().nullable(),
  serie_nfse: z.number().int().nullable(),
  ambiente: ambienteFiscal.nullable(),
  ultimos4: z.string().nullable(),
  criado_em: DataHoraIso.nullable(),
  atualizado_em: DataHoraIso.nullable(),
})
export type FiscalConfigEstado = z.infer<typeof FiscalConfigEstado>

// ---- Documentos fiscais ----------------------------------------------------------------------

/** POST /fiscal/documentos: pede a emissao de um documento para um pedido. */
export const DocumentoFiscalEmitirEntrada = z.strictObject({
  pedido_id: UuidSchema,
  tipo: tipoDocumentoFiscal,
})
export type DocumentoFiscalEmitirEntrada = z.infer<typeof DocumentoFiscalEmitirEntrada>

export const DocumentoFiscalSaida = z.strictObject({
  id: UuidSchema,
  pedido_id: UuidSchema,
  pedido_codigo: z.string(),
  tipo: tipoDocumentoFiscal,
  status: statusDocumentoFiscal,
  chave: z.string().nullable(),
  link: z.string().nullable(),
  erro: z.string().nullable(),
  valor_total_centavos: Centavos,
  tentativas: z.number().int().positive(),
  emitido_em: DataHoraIso.nullable(),
  criado_em: DataHoraIso,
  atualizado_em: DataHoraIso,
})
export type DocumentoFiscalDto = z.infer<typeof DocumentoFiscalSaida>

export const DocumentosFiscaisEntrada = z.strictObject({
  status: statusDocumentoFiscal.optional(),
  pedido_id: UuidSchema.optional(),
  limite: z.coerce.number().int().min(1).max(100).default(50),
})
export type DocumentosFiscaisBusca = z.infer<typeof DocumentosFiscaisEntrada>

export const DocumentosFiscaisSaida = z.strictObject({
  itens: z.array(DocumentoFiscalSaida),
})

export const DocumentoFiscalIdParams = z.strictObject({ id: UuidSchema })
