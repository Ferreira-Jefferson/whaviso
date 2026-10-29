// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/dashboard.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Contratos de borda do dashboard da loja (read-model). Fonte unica; o codegen reemite para o
// front. Dinheiro sempre em centavos (inteiro). Campos financeiros viram null para quem nao tem
// `relatorios:ver` (atendente ve so contagens operacionais). Datas de negocio em America/Sao_Paulo.
import { z } from 'zod'
import { Centavos } from './primitivos'

/** Data de negocio 'YYYY-MM-DD' (fuso America/Sao_Paulo). */
export const DataNegocio = z.iso.date()

/** Periodo: `de` e `ate` inclusivos. Ausentes = ultimos 30 dias ate hoje. Maximo 366 dias. */
export const DashboardFiltro = z.strictObject({
  de: DataNegocio.optional(),
  ate: DataNegocio.optional(),
})
export type DashboardFiltro = z.infer<typeof DashboardFiltro>

export const TopItensFiltro = DashboardFiltro.extend({
  limite: z.coerce.number().int().min(1).max(20).default(10),
})
export type TopItensFiltro = z.infer<typeof TopItensFiltro>

const Contagem = z.number().int().nonnegative()
const CentavosOuNulo = Centavos.nullable()

export const PeriodoSaida = z.strictObject({ de: DataNegocio, ate: DataNegocio })

export const DashboardResumo = z.strictObject({
  periodo: PeriodoSaida,
  total_pedidos: Contagem,
  por_status: z.strictObject({
    novo: Contagem, em_preparo: Contagem, saiu_entrega: Contagem, entregue: Contagem, problema: Contagem,
  }),
  por_origem: z.strictObject({ whatsapp: Contagem, ifood: Contagem, manual: Contagem }),
  por_modalidade: z.strictObject({ entrega: Contagem, retirada: Contagem }),
  faturamento_realizado_centavos: CentavosOuNulo,
  faturamento_em_andamento_centavos: CentavosOuNulo,
  ticket_medio_centavos: CentavosOuNulo,
  tempo_medio_entrega_minutos: z.number().nonnegative().nullable(),
})
export type DashboardResumo = z.infer<typeof DashboardResumo>

export const SeriePorDia = z.strictObject({
  periodo: PeriodoSaida,
  dias: z.array(z.strictObject({
    data: DataNegocio,
    pedidos: Contagem,
    entregues: Contagem,
    faturamento_centavos: CentavosOuNulo,
  })),
})
export type SeriePorDia = z.infer<typeof SeriePorDia>

export const SeriePorHora = z.strictObject({
  periodo: PeriodoSaida,
  horas: z.array(z.strictObject({
    hora: z.number().int().min(0).max(23),
    pedidos: Contagem,
    faturamento_centavos: CentavosOuNulo,
  })),
})
export type SeriePorHora = z.infer<typeof SeriePorHora>

export const TopItem = z.strictObject({
  nome: z.string(),
  quantidade: Contagem,
  receita_centavos: CentavosOuNulo,
})
export type TopItem = z.infer<typeof TopItem>

export const TopItensSaida = z.strictObject({
  periodo: PeriodoSaida,
  itens: z.array(TopItem),
})
export type TopItensSaida = z.infer<typeof TopItensSaida>

export const AtendimentoSaude = z.strictObject({
  periodo: PeriodoSaida,
  /** Foto atual (nao depende do periodo): conversas nao encerradas e as que estao em humano. */
  conversas_abertas: Contagem,
  conversas_em_humano: Contagem,
  /** Conversas criadas no periodo, por status atual. */
  conversas_no_periodo: z.strictObject({ ia: Contagem, humano: Contagem, encerrada: Contagem }),
  pedidos_com_conversa: Contagem,
  pedidos_sem_intervencao_humana: Contagem,
  /** sem_intervencao / com_conversa; null se nao ha pedido com conversa. */
  taxa_autonomia_ia: z.number().min(0).max(1).nullable(),
})
export type AtendimentoSaude = z.infer<typeof AtendimentoSaude>

/** Resposta agregada de todo o dashboard numa chamada so (GET /dashboard/geral). O servidor
 * resolve os cinco read-models em paralelo, de modo que a pagina paga uma ida ao banco em vez de
 * cinco. Cada campo e identico ao retorno da rota individual correspondente. */
export const DashboardGeral = z.strictObject({
  resumo: DashboardResumo,
  serie_diaria: SeriePorDia,
  por_hora: SeriePorHora,
  top_itens: TopItensSaida,
  atendimento: AtendimentoSaude,
})
export type DashboardGeral = z.infer<typeof DashboardGeral>
