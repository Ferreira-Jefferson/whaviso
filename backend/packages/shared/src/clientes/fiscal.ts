import { z } from 'zod'
import { CredencialResolvidaSchema, type ErroProvedor, type Resultado } from './erros'

// Fronteira ClienteFiscal (emissao de NFC-e/NFS-e por EMISSOR DE TERCEIRO).
//
// Nao somos um ERP nem um motor fiscal por UF: o emissor de terceiro calcula tributos, assina e
// transmite a SEFAZ/prefeitura. Aqui so enviamos o pedido e guardamos a referencia (chave, link).
// O PROVEDOR do emissor e decisao do dono do produto (nao escolhido): a implementacao real entra
// atras desta interface, com `fetchSeguro` e allowlist de host proprios do provedor escolhido.
//
// Rejeicao de negocio do emissor (ex.: dado fiscal invalido) NAO e excecao: volta como resposta
// `status: 'erro'` com o motivo curto. Falha de transporte/credencial volta como `falha(ErroProvedor)`
// (retentavel ou nao), para o chamador decidir.

export const TipoFiscal = z.enum(['nfce', 'nfse'])
export type TipoFiscal = z.infer<typeof TipoFiscal>

export const RegimeFiscal = z.enum(['mei', 'simples_nacional', 'lucro_presumido', 'lucro_real'])
export type RegimeFiscal = z.infer<typeof RegimeFiscal>

export const AmbienteFiscal = z.enum(['homologacao', 'producao'])
export type AmbienteFiscal = z.infer<typeof AmbienteFiscal>

const Centavos = z.number().int().nonnegative()

// Atributos fiscais do item (DADO de cadastro da loja, nao calculo): NCM, CFOP, origem, unidade e
// a situacao tributaria ja resolvida pelo regime (CSOSN p/ Simples/MEI, CST p/ regime normal). Sao
// opcionais no contrato (o fake/stub nao os exige); o emissor real (Focus) os repassa a SEFAZ e so
// autoriza a NFC-e quando presentes. A api valida a presenca antes de chamar o emissor.
export const ItemFiscal = z
  .object({
    descricao: z.string().min(1).max(200),
    quantidade: z.number().int().positive(),
    valorUnitarioCentavos: Centavos,
    valorTotalCentavos: Centavos,
    /** Codigo NCM (8 digitos). */
    ncm: z.string().regex(/^[0-9]{8}$/).optional(),
    /** CFOP (4 digitos). */
    cfop: z.string().regex(/^[0-9]{4}$/).optional(),
    /** Origem da mercadoria (0..8, tabela da SEFAZ). */
    origem: z.number().int().min(0).max(8).optional(),
    /** Unidade comercial/tributavel (ex.: UN, KG). */
    unidade: z.string().min(1).max(6).optional(),
    /** Situacao tributaria ja resolvida pelo regime (CSOSN ou CST), como string curta. */
    situacaoTributaria: z.string().regex(/^[0-9]{2,3}$/).optional(),
  })
  .strict()
export type ItemFiscal = z.infer<typeof ItemFiscal>

/** Entrada da emissao: tudo que o emissor precisa, sem dado pessoal do consumidor. */
export const EmitirFiscalEntrada = z
  .object({
    /** Identificador de idempotencia (id do documento): reenvio nao duplica a nota no emissor. */
    referencia: z.string().min(1).max(64),
    tipo: TipoFiscal,
    emitente: z
      .object({
        cnpj: z.string().regex(/^[0-9]{14}$/),
        regime: RegimeFiscal,
        serie: z.number().int().min(1).max(999),
        ambiente: AmbienteFiscal,
        credencial: CredencialResolvidaSchema,
      })
      .strict(),
    pedido: z
      .object({
        codigo: z.string().min(1).max(40),
        totalCentavos: Centavos,
        itens: z.array(ItemFiscal).min(1).max(500),
      })
      .strict(),
  })
  .strict()
export type EmitirFiscalEntrada = z.infer<typeof EmitirFiscalEntrada>

export const StatusEmissao = z.enum(['pendente', 'emitido', 'erro'])
export type StatusEmissao = z.infer<typeof StatusEmissao>

export interface EmitirFiscalResposta {
  /** `pendente`: emissor aceitou e processa de forma assincrona; `erro`: rejeitado pelo emissor. */
  status: StatusEmissao
  /** Chave de acesso / id no emissor (presente quando `emitido`). */
  chave: string | null
  /** URL https do documento (DANFE/PDF/consulta), quando houver. */
  link: string | null
  /** Motivo curto da rejeicao (nunca dado sensivel), quando `erro`. */
  erro: string | null
}

type R<T> = Promise<Resultado<T, ErroProvedor>>

export interface ClienteFiscal {
  emitir(entrada: EmitirFiscalEntrada): R<EmitirFiscalResposta>
}
