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

// --- Relatorio de vendas combinavel (montador) -------------------------------
// O usuario escolhe UMA dimensao de agrupamento e zero ou mais filtros. Dimensoes "fixas"
// (abaixo) + dinamicas 'opcao:<grupo_id>', onde <grupo_id> e um grupo de opcao do cardapio da
// loja (Tamanho, Sabor, Adicional...), vindas do cadastro e nao de lista fixa. Tudo medido no
// GRAO DE ITEM (linha do pedido): faturamento = receita dos itens (exclui taxa de entrega e
// descontos de pedido), pedidos = pedidos distintos, unidades = soma das quantidades. Pedidos
// `entregue` apenas. O salao (mesa/comanda) NAO entra aqui: nao se liga a pedido.
export const DimensaoFixa = z.enum([
  'dia', 'semana', 'mes', 'hora', 'dia_semana', 'origem', 'modalidade', 'categoria', 'item', 'motoboy',
])
export type DimensaoFixa = z.infer<typeof DimensaoFixa>

const DIMENSOES_FIXAS = new Set<string>(DimensaoFixa.options)
/** 'opcao:<uuid>': agrupar/filtrar pela opcao escolhida dentro desse grupo de opcao da loja. */
export const RE_DIMENSAO_OPCAO = /^opcao:[0-9a-fA-F-]{36}$/
export const Dimensao = z.string().refine(
  (v) => DIMENSOES_FIXAS.has(v) || RE_DIMENSAO_OPCAO.test(v), 'dimensao desconhecida')
export type Dimensao = z.infer<typeof Dimensao>

/** Um filtro: mantem as linhas cuja `dimensao` casa com algum dos `valores` (OU interno). */
export const VendasFiltro = z.strictObject({
  dimensao: Dimensao,
  /** Chaves a manter. Ex.: 'entrega'; nome do item/categoria; 'Grande'; id do motoboy ou 'sem'. */
  valores: z.array(z.string().min(1).max(200)).min(1).max(100),
})
export type VendasFiltro = z.infer<typeof VendasFiltro>

/** Corpo da consulta flexivel (POST): periodo + agrupamento + filtros combinados (E entre eles). */
export const VendasConsulta = RelatorioPeriodo.extend({
  agrupar_por: Dimensao,
  filtros: z.array(VendasFiltro).max(10).default([]),
  limite: z.coerce.number().int().min(1).max(500).default(50),
})
export type VendasConsulta = z.infer<typeof VendasConsulta>

export const PeriodoRelatorio = z.strictObject({ de: DataNegocio, ate: DataNegocio })

export const VendasLinha = z.strictObject({
  /** Valor estavel da dimensao (ex.: '2026-03-10', '14', 'whatsapp', nome do item/opcao, id do motoboy). */
  chave: z.string(),
  rotulo: z.string(),
  /** Pedidos distintos do grupo. */
  pedidos: Contagem,
  /** Unidades (soma das quantidades) do grupo. */
  quantidade: Contagem,
  /** Receita dos itens do grupo (exclui taxa de entrega e descontos de pedido). */
  faturamento_centavos: Centavos,
  /** faturamento / pedidos (receita de itens por pedido do grupo); null se nao houver pedido. */
  ticket_medio_centavos: Centavos.nullable(),
  /** Fatia 0..1 do faturamento do grupo no total do periodo (null se total 0). */
  participacao: z.number().min(0).max(1).nullable(),
})

/** Resultado do montador: linhas agrupadas pela dimensao, no grao de item (pedidos `entregue`). */
export const VendasSaida = z.strictObject({
  periodo: PeriodoRelatorio,
  agrupar_por: Dimensao,
  linhas: z.array(VendasLinha),
  total_pedidos: Contagem,
  total_faturamento_centavos: Centavos,
})
export type VendasSaida = z.infer<typeof VendasSaida>

/**
 * Salao por mesa: comandas FECHADAS do salao agrupadas por mesa. Fonte propria (nao se liga a
 * pedido), por isso fica fora do montador. `quantidade` nas linhas vem 0 (comanda nao tem unidade).
 */
export const SalaoSaida = z.strictObject({
  periodo: PeriodoRelatorio,
  linhas: z.array(VendasLinha),
  total_pedidos: Contagem,
  total_faturamento_centavos: Centavos,
})
export type SalaoSaida = z.infer<typeof SalaoSaida>

// --- Dimensoes disponiveis (alimenta os seletores do montador) ----------------
/** Um valor possivel de uma dimensao, para o seletor de filtro. */
export const DimensaoValor = z.strictObject({ chave: z.string(), rotulo: z.string() })
export type DimensaoValor = z.infer<typeof DimensaoValor>

export const DimensaoGrupoUi = z.enum(['tempo', 'pedido', 'item', 'opcao'])

/** Uma dimensao que a loja pode usar (fixa ou um grupo de opcao do cardapio). */
export const DimensaoDisponivel = z.strictObject({
  chave: Dimensao,
  rotulo: z.string(),
  /** Agrupador visual do seletor. */
  grupo: DimensaoGrupoUi,
  /** Serve como filtro? (dimensoes de tempo nao: use o periodo.) */
  filtravel: z.boolean(),
  /** Valores conhecidos p/ o seletor de filtro; null quando a lista e aberta demais (ex.: item). */
  valores: z.array(DimensaoValor).nullable(),
})
export type DimensaoDisponivel = z.infer<typeof DimensaoDisponivel>

/** Catalogo de dimensoes da loja para montar o relatorio (agrupar e filtrar). */
export const DimensoesSaida = z.strictObject({
  dimensoes: z.array(DimensaoDisponivel),
})
export type DimensoesSaida = z.infer<typeof DimensoesSaida>

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
