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
    auto_emitir: z.boolean().optional(),
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
  /** Emissao automatica de NFC-e para pedidos concluidos (acionada pelo painel/endpoint auto). */
  auto_emitir: z.boolean(),
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

// ---- Dados fiscais por item (catalogo) -------------------------------------------------------
// DADO de cadastro (fonte: contador da loja), nao calculo: NCM, CFOP, origem, unidade e a situacao
// tributaria (CSOSN para Simples/MEI, CST para regime normal). Um item sem estes dados nao gera
// NFC-e (a emissao lista os itens pendentes). CSOSN e CST sao exclusivos: informe o do seu regime.

const Ncm = z.string().regex(/^[0-9]{8}$/, 'NCM: 8 digitos')
const Cfop = z.string().regex(/^[0-9]{4}$/, 'CFOP: 4 digitos')
const Origem = z.number().int().min(0).max(8)
const Unidade = z.string().trim().min(1).max(6)
const Csosn = z.string().regex(/^[0-9]{3}$/, 'CSOSN: 3 digitos')
const Cst = z.string().regex(/^[0-9]{2,3}$/, 'CST: 2 ou 3 digitos')

/** PUT /fiscal/itens/:itemId: cadastra/ajusta o dado fiscal de um item do catalogo. */
export const ItemFiscalDadoEntrada = z
  .strictObject({
    ncm: Ncm,
    cfop: Cfop,
    origem: Origem.default(0),
    unidade: Unidade.default('UN'),
    csosn: Csosn.nullish(),
    cst: Cst.nullish(),
  })
  .refine((v) => v.csosn != null || v.cst != null, {
    message: 'informe a situacao tributaria (CSOSN para Simples/MEI ou CST para regime normal)',
  })
export type ItemFiscalDadoEntrada = z.infer<typeof ItemFiscalDadoEntrada>

/** Item do catalogo com o dado fiscal (nulo quando ainda nao cadastrado). */
export const ItemFiscalLinha = z.strictObject({
  item_id: UuidSchema,
  nome: z.string(),
  categoria_nome: z.string().nullable(),
  ativo: z.boolean(),
  ncm: z.string().nullable(),
  cfop: z.string().nullable(),
  origem: z.number().int().nullable(),
  unidade: z.string().nullable(),
  csosn: z.string().nullable(),
  cst: z.string().nullable(),
  /** true quando o item ja tem o dado minimo para emitir (NCM, CFOP, origem, unidade e situacao). */
  completo: z.boolean(),
})
export type ItemFiscalLinhaDto = z.infer<typeof ItemFiscalLinha>

export const ItensFiscaisSaida = z.strictObject({ itens: z.array(ItemFiscalLinha) })

export const ItemFiscalIdParams = z.strictObject({ itemId: UuidSchema })

// ---- Pedidos elegiveis a emissao -------------------------------------------------------------

/** Pedido concluido que ainda nao tem NFC-e (candidato a emissao pelo painel). */
export const PedidoEmissivelSaida = z.strictObject({
  pedido_id: UuidSchema,
  codigo: z.string(),
  status: z.string(),
  total_centavos: Centavos,
  criado_em: DataHoraIso,
})
export type PedidoEmissivelDto = z.infer<typeof PedidoEmissivelSaida>

export const PedidosEmissiveisSaida = z.strictObject({ itens: z.array(PedidoEmissivelSaida) })

/** Resumo da emissao automatica em lote (POST /fiscal/documentos/auto). */
export const AutoEmissaoSaida = z.strictObject({
  emitidos: z.number().int().nonnegative(),
  com_erro: z.number().int().nonnegative(),
  pulados: z.number().int().nonnegative(),
})
export type AutoEmissaoResumo = z.infer<typeof AutoEmissaoSaida>
