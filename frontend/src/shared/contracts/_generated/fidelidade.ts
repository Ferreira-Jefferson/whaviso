// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/fidelidade.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Contratos de borda do modulo fidelidade (fonte unica; o codegen reemite para o front).
// Schemas Zod estritos. Dinheiro em centavos (int). Datas em ISO UTC. Nenhum telefone trafega
// aqui (a ficha do cliente fica em clientes). `valor` esta na unidade do programa: centavos de
// credito no modo cashback, pontos inteiros no modo pontos.
import { z } from 'zod'
import { Cursor, UuidSchema } from './primitivos'

const Uuid = UuidSchema
const DataHora = z.string().min(1)
const Inteiro = z.number().int()

export const ModoFidelidade = z.enum(['pontos', 'cashback'])
export type ModoFidelidadeTipo = z.infer<typeof ModoFidelidade>

// ---------------------------------------------------------------- programa

export const ProgramaEntrada = z.strictObject({
  ativo: z.boolean(),
  modo: ModoFidelidade,
  /** Cashback em pontos-base: 500 = 5,00% do subtotal pago. */
  cashback_bps: Inteiro.min(0).max(10000),
  /** Pontos ganhos por R$ 1,00 do subtotal pago. */
  pontos_por_real: Inteiro.min(1).max(1000),
  /** Quanto vale 1 ponto no resgate, em centavos. */
  valor_ponto_centavos: Inteiro.min(1).max(10000),
  /** Resgate minimo, na unidade do programa. */
  minimo_resgate: Inteiro.min(0).max(100_000_000),
  /** Teto do resgate como % do subtotal do pedido (5000 = 50%). */
  max_resgate_bps: Inteiro.min(1).max(10000),
})
export type ProgramaNovo = z.infer<typeof ProgramaEntrada>

export const ProgramaSaida = ProgramaEntrada.extend({
  /** false quando a loja ainda nao configurou (valores padrao, programa inativo). */
  configurado: z.boolean(),
  atualizado_em: DataHora.nullable(),
})
export type ProgramaDto = z.infer<typeof ProgramaSaida>

// ---------------------------------------------------------------- movimentos

export const TipoMovimento = z.enum(['acumulo', 'resgate'])

export const MovimentoFidelidadeSaida = z.strictObject({
  id: Uuid,
  cliente_id: Uuid,
  pedido_id: Uuid,
  pedido_codigo: z.string(),
  tipo: TipoMovimento,
  valor: Inteiro.positive(),
  desconto_centavos: Inteiro.positive().nullable(),
  saldo_apos: Inteiro.nonnegative(),
  criado_em: DataHora,
})
export type MovimentoDto = z.infer<typeof MovimentoFidelidadeSaida>

export const AcumularEntrada = z.strictObject({ pedido_id: Uuid })
export type AcumularNovo = z.infer<typeof AcumularEntrada>

export const ResgatarEntrada = z.strictObject({
  pedido_id: Uuid,
  /** Quanto resgatar, na unidade do programa (centavos no cashback, pontos no modo pontos). */
  valor: Inteiro.positive().max(100_000_000),
})
export type ResgatarNovo = z.infer<typeof ResgatarEntrada>

export const ClienteIdParams = z.strictObject({ clienteId: Uuid })

// ---------------------------------------------------------------- saldo e extrato

export const SaldoSaida = z.strictObject({
  cliente_id: Uuid,
  modo: ModoFidelidade,
  /** Saldo derivado do livro, na unidade do programa. */
  saldo: Inteiro.nonnegative(),
  /** Equivalente em centavos que o saldo vale hoje no resgate. */
  saldo_centavos: Inteiro.nonnegative(),
})
export type SaldoDto = z.infer<typeof SaldoSaida>

export const MovimentosEntrada = z.strictObject({
  cursor: Cursor.optional(),
  limite: z.coerce.number().int().min(1).max(100).default(20),
})
export type MovimentosBusca = z.infer<typeof MovimentosEntrada>

export const MovimentosSaida = z.strictObject({
  itens: z.array(MovimentoFidelidadeSaida),
  proximoCursor: z.string().nullable(),
})

export const AcumuloSaida = z.strictObject({
  movimento: MovimentoFidelidadeSaida,
  saldo: Inteiro.nonnegative(),
})

export const ResgateSaida = z.strictObject({
  movimento: MovimentoFidelidadeSaida,
  saldo: Inteiro.nonnegative(),
  /** Desconto a aplicar no pedido, em centavos. */
  desconto_centavos: Inteiro.positive(),
})
