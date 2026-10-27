// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/pagamentos.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Contratos de borda de API-pagamentos (Pix na conversa). Fonte única; o codegen reemite
// para o front. A chave Pix é SEGREDO: entra (write-only) em `LojaPixEntrada`, mas NUNCA sai
// num DTO de resposta. `LojaPixEstado` expõe só metadado (tipo, titular, cidade, últimos 4).
//
// O `br_code` (copia e cola) volta em `PagamentoSaida` de propósito: ele embute a chave em
// claro porque é o texto que o pagador escaneia/copia (dado público por natureza do Pix). O
// segredo protegido é a chave CIFRADA em repouso e o fato de a chave nunca entrar em log.
import { z } from 'zod'
import { DataHoraIso, UuidSchema } from './primitivos'
import { statusPagamento, tipoChavePix } from './enums'

// Valor de cobrança: inteiro em CENTAVOS, estritamente positivo (uma cobrança de R$ 0 não
// existe). Teto defensivo igual ao de `Centavos` (R$ 10 milhões).
export const ValorCobranca = z
  .number()
  .int('valor em centavos deve ser inteiro')
  .positive('valor da cobrança deve ser positivo')
  .max(1_000_000_000, 'valor acima do teto')

// --- Validação da chave por tipo (spec etapa 3) ---------------------------------------------
// Auxílio de integridade na borda (SEC-081): a chave tem que ser coerente com o `tipo`
// declarado. Não substitui o DICT (quem resolve a chave de verdade é o banco do pagador), mas
// barra erro grosseiro de digitação antes de cifrar e gerar o BR Code.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function digitos(v: string): string {
  return v.replace(/\D/g, '')
}

// Dígitos verificadores do CPF (rejeita sequências repetidas, que passam na conta mas não são CPF).
function cpfValido(v: string): boolean {
  const d = digitos(v)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (ate: number): number => {
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

// Dígitos verificadores do CNPJ (14 dígitos, pesos 5..2 e 6..2).
function cnpjValido(v: string): boolean {
  const d = digitos(v)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const dv = (ate: number): number => {
    const pesos = ate === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * pesos[i]!
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13])
}

// Telefone: E.164 depois de tirar a pontuação. Aceita com ou sem "+"; 10 a 15 dígitos.
function telefoneValido(v: string): boolean {
  const comMais = v.trim().startsWith('+')
  const d = digitos(v)
  if (comMais && d.startsWith('0')) return false
  return d.length >= 10 && d.length <= 15
}

function chaveCoerente(tipo: z.infer<typeof tipoChavePix>, chave: string): boolean {
  const v = chave.trim()
  switch (tipo) {
    case 'cpf':
      return cpfValido(v)
    case 'cnpj':
      return cnpjValido(v)
    case 'email':
      return EMAIL.test(v) && v.length <= 77
    case 'telefone':
      return telefoneValido(v)
    case 'aleatoria':
      return UUID.test(v)
  }
}

// --- Entradas -------------------------------------------------------------------------------

/** Cadastro/rotação da chave Pix da loja (write-only: a chave em claro só entra, nunca sai). */
export const LojaPixEntrada = z
  .strictObject({
    tipo: tipoChavePix,
    chave: z.string().trim().min(1).max(140),
    titular: z.string().trim().min(1).max(60),
    cidade: z.string().trim().min(1).max(30).optional(),
  })
  .superRefine((val, ctx) => {
    if (!chaveCoerente(val.tipo, val.chave)) {
      ctx.addIssue({
        code: 'custom',
        path: ['chave'],
        message: `chave Pix não confere com o tipo "${val.tipo}"`,
      })
    }
  })
export type LojaPixEntrada = z.infer<typeof LojaPixEntrada>

/** Criar cobrança de um pedido. O valor vem SEMPRE do pedido; aqui só a janela de expiração. */
export const CriarCobrancaEntrada = z.strictObject({
  expira_em_minutos: z.number().int().min(1).max(1440).default(30),
})
export type CriarCobrancaEntrada = z.infer<typeof CriarCobrancaEntrada>

/** Conciliar (marcar pago). `pago_em` opcional: quando o dono registra o horário real do Pix. */
export const ConciliarEntrada = z.strictObject({
  pago_em: DataHoraIso.optional(),
})
export type ConciliarEntrada = z.infer<typeof ConciliarEntrada>

/** Filtro de listagem por loja (pedido e/ou status). */
export const PagamentosFiltro = z.strictObject({
  pedido_id: UuidSchema.optional(),
  status: statusPagamento.optional(),
})
export type PagamentosFiltro = z.infer<typeof PagamentosFiltro>

// --- Saídas ---------------------------------------------------------------------------------

/** Metadado da chave Pix da loja. NUNCA inclui a chave em claro nem a cifra (SEC-020). */
export const LojaPixEstado = z.strictObject({
  loja_id: UuidSchema,
  tipo: tipoChavePix,
  ultimos4: z.string().nullable(),
  titular: z.string(),
  cidade: z.string().nullable(),
  atualizado_em: DataHoraIso,
})
export type LojaPixEstado = z.infer<typeof LojaPixEstado>

/** Resposta do GET/PUT da chave: `pix` é null quando a loja ainda não cadastrou. */
export const LojaPixEstadoResposta = z.strictObject({
  pix: LojaPixEstado.nullable(),
})
export type LojaPixEstadoResposta = z.infer<typeof LojaPixEstadoResposta>

/** Cobrança Pix de um pedido. `br_code` é o copia e cola a enviar ao cliente. */
export const PagamentoSaida = z.strictObject({
  id: UuidSchema,
  loja_id: UuidSchema,
  pedido_id: UuidSchema,
  status: statusPagamento,
  valor_centavos: ValorCobranca,
  txid: z.string().nullable(),
  br_code: z.string().nullable(),
  expira_em: DataHoraIso.nullable(),
  pago_em: DataHoraIso.nullable(),
  criado_em: DataHoraIso,
  atualizado_em: DataHoraIso,
})
export type PagamentoSaida = z.infer<typeof PagamentoSaida>

export const ListaPagamentosSaida = z.strictObject({
  pagamentos: z.array(PagamentoSaida),
})
export type ListaPagamentosSaida = z.infer<typeof ListaPagamentosSaida>
