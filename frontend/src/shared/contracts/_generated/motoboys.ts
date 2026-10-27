// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/motoboys.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Contratos de borda do modulo motoboys (cadastro de entrega + fechamento do dia). Fonte unica
// (o codegen reemite para o front). Schemas Zod estritos (SEC-081). O motoboy e uma PESSOA de cargo
// 'motoboy' (modulo pessoas): nome e telefone vivem la; aqui ficam veiculo, placa e Pix.
// Pix e telefone so existem em claro na ENTRADA e em MotoboyPixSaida (revelar, dono/gerente);
// toda outra saida traz apenas mascara (ultimos 4). Dinheiro em centavos (int); o lancamento de
// ajuste pode ser negativo. Datas de negocio 'YYYY-MM-DD' em America/Sao_Paulo.
import { z } from 'zod'
import { statusFechamento, tipoChavePix, tipoLancamento, tipoVeiculo } from './enums'
import { UuidSchema } from './primitivos'

const Uuid = UuidSchema
const DataHora = z.string().min(1)
const DataNegocio = z.iso.date()
const texto = (max: number) => z.string().trim().min(1).max(max)

// ---------------------------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------------------------
// Placa/Pix: so string nao vazia aqui; formato e normalizacao ficam no service (422 de regra de
// negocio: 'placa_invalida', 'pix_invalido'), como telefone em pessoas. Nao e erro de shape (400).
export const MotoboyEntrada = z
  .strictObject({
    pessoa_id: Uuid,
    veiculo: tipoVeiculo.optional(),
    placa: z.string().trim().min(1).max(12).optional(),
    pix_tipo: tipoChavePix.optional(),
    pix: z.string().trim().min(1).max(140).optional(),
  })
  .refine((o) => (o.pix_tipo === undefined) === (o.pix === undefined), {
    message: 'informe pix_tipo e pix juntos',
  })

/** PATCH parcial: placa e Pix podem ser limpos com null (Pix: os dois juntos). Ativo tem rota propria. */
export const MotoboyAtualizarEntrada = z
  .strictObject({
    veiculo: tipoVeiculo.optional(),
    placa: z.string().trim().min(1).max(12).nullable().optional(),
    pix_tipo: tipoChavePix.nullable().optional(),
    pix: z.string().trim().min(1).max(140).nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'informe ao menos um campo' })
  .refine((o) => (o.pix_tipo === undefined) === (o.pix === undefined), {
    message: 'informe pix_tipo e pix juntos',
  })
  .refine((o) => (o.pix_tipo === null) === (o.pix === null), {
    message: 'para limpar o Pix, envie pix_tipo e pix como null',
  })

export const MotoboyListaQuery = z.strictObject({
  incluir_inativos: z.enum(['true', 'false']).optional(),
})

export const MotoboySaida = z.strictObject({
  id: Uuid,
  pessoa_id: Uuid.nullable(),
  nome: z.string(),
  telefone_ultimos4: z.string().nullable(),
  veiculo: tipoVeiculo,
  placa: z.string().nullable(),
  pix_tipo: tipoChavePix.nullable(),
  pix_ultimos4: z.string().nullable(),
  ativo: z.boolean(),
  criado_em: DataHora,
  atualizado_em: DataHora,
})
export const MotoboyListaSaida = z.strictObject({ itens: z.array(MotoboySaida) })

/** Listagem leve para o seletor de despacho: sem telefone, placa nem Pix. */
export const MotoboySeletorSaida = z.strictObject({
  id: Uuid,
  nome: z.string(),
  veiculo: tipoVeiculo,
  ativo: z.boolean(),
})
export const MotoboySeletorListaSaida = z.strictObject({ itens: z.array(MotoboySeletorSaida) })

/** Chave Pix em claro: so na resposta de "revelar" (dono/gerente, rate limit, no-store). */
export const MotoboyPixSaida = z.strictObject({
  pix_tipo: tipoChavePix,
  pix: z.string(),
})

// ---------------------------------------------------------------------------------------------
// Lancamentos (append-only) e fechamento do dia
// ---------------------------------------------------------------------------------------------
/** Ajuste manual: valor com sinal (bonus, desconto, entrega sem motoboy fixo). Correcao = novo lancamento oposto. */
export const LancamentoManualEntrada = z.strictObject({
  valor_centavos: z
    .number()
    .int('valor em centavos deve ser inteiro')
    .min(-1_000_000_000)
    .max(1_000_000_000)
    .refine((v) => v !== 0, { message: 'valor nao pode ser zero' }),
  descricao: texto(200),
  /** Dia de negocio do ajuste; padrao = hoje (SP). Nao pode ser futuro. */
  data: DataNegocio.optional(),
})

export const LancamentoSaida = z.strictObject({
  id: z.string(),
  data: DataNegocio,
  tipo: tipoLancamento,
  pedido_id: Uuid.nullable(),
  valor_centavos: z.number().int(),
  descricao: z.string().nullable(),
  criado_em: DataHora,
})

export const FechamentoDiaQuery = z.strictObject({ data: DataNegocio.optional() })

export const FechamentoLinha = z.strictObject({
  id: Uuid,
  motoboy_id: Uuid,
  motoboy_nome: z.string(),
  data: DataNegocio,
  status: statusFechamento,
  pago_em: DataHora.nullable(),
  qtd_entregas: z.number().int(),
  entregas_centavos: z.number().int(),
  ajustes_centavos: z.number().int(),
  /** Derivado: soma dos lancamentos (nunca armazenado). */
  total_centavos: z.number().int(),
  lancamentos: z.array(LancamentoSaida),
})

export const FechamentoDia = z.strictObject({
  data: DataNegocio,
  total_centavos: z.number().int(),
  linhas: z.array(FechamentoLinha),
})

/** Confirma o total que o dono viu: se mudou desde entao, o pagamento e recusado (409). */
export const PagarFechamentoEntrada = z.strictObject({
  total_centavos: z.number().int(),
})

export const MotoboyResumoQuery = z.strictObject({
  de: DataNegocio,
  ate: DataNegocio,
})

export const MotoboyResumoLinha = z.strictObject({
  motoboy_id: Uuid,
  motoboy_nome: z.string(),
  qtd_entregas: z.number().int(),
  entregas_centavos: z.number().int(),
  ajustes_centavos: z.number().int(),
  total_centavos: z.number().int(),
})

export const MotoboyResumoPeriodo = z.strictObject({
  de: DataNegocio,
  ate: DataNegocio,
  total_centavos: z.number().int(),
  itens: z.array(MotoboyResumoLinha),
})

export type MotoboyNovo = z.infer<typeof MotoboyEntrada>
export type MotoboyPatch = z.infer<typeof MotoboyAtualizarEntrada>
export type MotoboyDto = z.infer<typeof MotoboySaida>
export type MotoboySeletorDto = z.infer<typeof MotoboySeletorSaida>
export type LancamentoNovo = z.infer<typeof LancamentoManualEntrada>
export type LancamentoDto = z.infer<typeof LancamentoSaida>
export type FechamentoLinhaDto = z.infer<typeof FechamentoLinha>
export type FechamentoDiaDto = z.infer<typeof FechamentoDia>
export type MotoboyResumoPeriodoDto = z.infer<typeof MotoboyResumoPeriodo>
