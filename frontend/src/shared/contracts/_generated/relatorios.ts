// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/relatorios.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Contratos de borda dos relatorios da loja (BI de fundo, alem do dashboard). Fonte unica; o
// codegen reemite para o front. Dinheiro em centavos (inteiro). Todos os relatorios exigem
// `relatorios:ver` (dono/gerente), por isso nao ha campos financeiros anulaveis. Datas de negocio
// em America/Sao_Paulo; `de`/`ate` inclusivos. Nenhum dado pessoal e devolvido.
import { z } from 'zod'
import { Centavos } from './primitivos'

const DataNegocio = z.iso.date()
const Contagem = z.number().int().nonnegative()

/** Periodo: ausentes = ultimos 30 dias ate hoje (SP). Maximo 366 dias. */
export const RelatorioPeriodo = z.strictObject({
  de: DataNegocio.optional(),
  ate: DataNegocio.optional(),
})
export type RelatorioPeriodo = z.infer<typeof RelatorioPeriodo>

// Dimensoes de agrupamento. A maioria agrega pedidos entregues; tres tem fonte propria:
//   motoboy  = pedidos entregues por entregador (pedidos sem motoboy caem em "Sem motoboy");
//   tamanho  = itens de pedidos entregues cuja opcao vem de um grupo tipo 'tamanho' (unidades);
//   mesa     = comandas FECHADAS do salao por mesa (fonte: salao, nao pedidos).
export const VendasDimensao = z.enum([
  'dia', 'semana', 'mes', 'hora', 'dia_semana', 'origem', 'modalidade', 'categoria', 'item',
  'motoboy', 'tamanho', 'mesa',
])
export type VendasDimensao = z.infer<typeof VendasDimensao>

export const VendasFiltro = RelatorioPeriodo.extend({
  agrupar_por: VendasDimensao,
  /** So vale para `categoria` e `item` (top N por faturamento). */
  limite: z.coerce.number().int().min(1).max(100).default(20),
})
export type VendasFiltro = z.infer<typeof VendasFiltro>

export const PeriodoRelatorio = z.strictObject({ de: DataNegocio, ate: DataNegocio })

export const VendasLinha = z.strictObject({
  /** Valor estavel da dimensao (ex.: '2026-03-10', '14', 'whatsapp', nome do item). */
  chave: z.string(),
  rotulo: z.string(),
  /** Pedidos do grupo; em `mesa` conta comandas fechadas. */
  pedidos: Contagem,
  /** Unidades vendidas; so em `categoria`, `item` e `tamanho` (null nas demais). */
  quantidade: Contagem.nullable(),
  faturamento_centavos: Centavos,
  /** faturamento / pedidos; null em `categoria`, `item` e `tamanho` (receita da linha, nao do pedido). */
  ticket_medio_centavos: Centavos.nullable(),
  /** Fatia 0..1 do faturamento do grupo no total do periodo (null se total 0). */
  participacao: z.number().min(0).max(1).nullable(),
})

/**
 * Vendas realizadas agrupadas pela dimensao pedida. Em quase todas as dimensoes os totais
 * sao de pedidos `entregue`; em `mesa` refletem comandas FECHADAS do salao.
 */
export const VendasSaida = z.strictObject({
  periodo: PeriodoRelatorio,
  agrupar_por: VendasDimensao,
  linhas: z.array(VendasLinha),
  total_pedidos: Contagem,
  total_faturamento_centavos: Centavos,
})
export type VendasSaida = z.infer<typeof VendasSaida>

export const FormaPagamentoRel = z.enum(['dinheiro', 'credito', 'debito', 'pix', 'outro'])

export const FormasPagamentoSaida = z.strictObject({
  periodo: PeriodoRelatorio,
  linhas: z.array(z.strictObject({
    forma: FormaPagamentoRel,
    transacoes: Contagem,
    valor_centavos: Centavos,
    participacao: z.number().min(0).max(1).nullable(),
  })),
  total_centavos: Centavos,
})
export type FormasPagamentoSaida = z.infer<typeof FormasPagamentoSaida>

export const CancelamentosFiltro = RelatorioPeriodo.extend({
  limite: z.coerce.number().int().min(1).max(100).default(20),
})
export type CancelamentosFiltro = z.infer<typeof CancelamentosFiltro>

/** Pedidos em `problema` (motivo obrigatorio no banco) agrupados pelo motivo normalizado. */
export const CancelamentosSaida = z.strictObject({
  periodo: PeriodoRelatorio,
  total_pedidos: Contagem,
  total_problemas: Contagem,
  /** problemas / pedidos do periodo (null se nao ha pedido). */
  taxa_problema: z.number().min(0).max(1).nullable(),
  valor_perdido_centavos: Centavos,
  motivos: z.array(z.strictObject({
    motivo: z.string(),
    pedidos: Contagem,
    valor_centavos: Centavos,
  })),
})
export type CancelamentosSaida = z.infer<typeof CancelamentosSaida>

/** Coortes mensais de clientes pela data do primeiro pedido valido (nunca expoe cliente). */
export const CoortesSaida = z.strictObject({
  periodo: PeriodoRelatorio,
  coortes: z.array(z.strictObject({
    /** Mes (SP) do primeiro pedido, 'YYYY-MM'. */
    mes: z.string().regex(/^\d{4}-\d{2}$/),
    clientes: Contagem,
    /** offset 0 = mes da estreia (= clientes); so ate o mes corrente, maximo 12. */
    retencao: z.array(z.strictObject({
      offset: z.number().int().min(0).max(12),
      clientes: Contagem,
      taxa: z.number().min(0).max(1).nullable(),
    })),
  })),
})
export type CoortesSaida = z.infer<typeof CoortesSaida>
