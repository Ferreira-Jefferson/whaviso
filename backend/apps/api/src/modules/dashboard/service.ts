// Regra do dashboard (read-model). Sem acesso HTTP; erros de dominio via shared/http_errors.
// Papel sem `relatorios:ver` (atendente) recebe so contagens: campos financeiros viram null.
import type { Pool } from '@whaviso/shared/db'
import { HttpError } from '../../shared/http_errors'
import { minutos, razao, ticketMedio } from './metricas'
import { normalizarPeriodo, PeriodoInvalido, type Periodo } from './periodo'
import * as repo from './repo'
import type {
  AtendimentoSaude, DashboardFiltro, DashboardResumo, SeriePorDia, SeriePorHora, TopItensFiltro,
  TopItensSaida,
} from './schemas'

export interface Ator {
  lojaId: string
  /** true se o papel tem `relatorios:ver` (dono/gerente): libera faturamento e ticket. */
  verFinanceiro: boolean
}

function periodoDe(f: DashboardFiltro): Periodo {
  try {
    return normalizarPeriodo(f.de, f.ate)
  } catch (e) {
    if (e instanceof PeriodoInvalido) throw new HttpError(400, 'periodo_invalido', e.message)
    throw e
  }
}

const janela = (a: Ator, p: Periodo): repo.Janela => ({ lojaId: a.lojaId, inicio: p.inicio, fim: p.fim })
const saidaPeriodo = (p: Periodo) => ({ de: p.de, ate: p.ate })
const fin = (a: Ator, v: number): number | null => (a.verFinanceiro ? v : null)

export function criarServicoDashboard(pool: Pool) {
  return {
    async resumo(a: Ator, f: DashboardFiltro): Promise<DashboardResumo> {
      const p = periodoDe(f)
      const r = await repo.resumo(pool, janela(a, p))
      const ticket = ticketMedio(r.fat_realizado, r.entregue)
      return {
        periodo: saidaPeriodo(p),
        total_pedidos: r.total,
        por_status: {
          novo: r.novo, em_preparo: r.em_preparo, saiu_entrega: r.saiu_entrega, entregue: r.entregue,
          problema: r.problema,
        },
        por_origem: { whatsapp: r.whatsapp, ifood: r.ifood, manual: r.manual },
        por_modalidade: { entrega: r.entrega, retirada: r.retirada },
        faturamento_realizado_centavos: fin(a, r.fat_realizado),
        faturamento_em_andamento_centavos: fin(a, r.fat_andamento),
        ticket_medio_centavos: a.verFinanceiro ? ticket : null,
        tempo_medio_entrega_minutos: minutos(r.minutos_medio),
      }
    },

    async serieDiaria(a: Ator, f: DashboardFiltro): Promise<SeriePorDia> {
      const p = periodoDe(f)
      const linhas = await repo.seriePorDia(pool, janela(a, p), p.de, p.ate)
      return {
        periodo: saidaPeriodo(p),
        dias: linhas.map((l) => ({
          data: l.data, pedidos: l.pedidos, entregues: l.entregues, faturamento_centavos: fin(a, l.faturamento),
        })),
      }
    },

    async porHora(a: Ator, f: DashboardFiltro): Promise<SeriePorHora> {
      const p = periodoDe(f)
      const linhas = await repo.seriePorHora(pool, janela(a, p))
      return {
        periodo: saidaPeriodo(p),
        horas: linhas.map((l) => ({ hora: l.hora, pedidos: l.pedidos, faturamento_centavos: fin(a, l.faturamento) })),
      }
    },

    async topItens(a: Ator, f: TopItensFiltro): Promise<TopItensSaida> {
      const p = periodoDe(f)
      const linhas = await repo.topItens(pool, janela(a, p), f.limite)
      return {
        periodo: saidaPeriodo(p),
        itens: linhas.map((l) => ({ nome: l.nome, quantidade: l.quantidade, receita_centavos: fin(a, l.receita) })),
      }
    },

    async atendimento(a: Ator, f: DashboardFiltro): Promise<AtendimentoSaude> {
      const p = periodoDe(f)
      const j = janela(a, p)
      const [c, au] = await Promise.all([repo.conversas(pool, j), repo.autonomia(pool, j)])
      return {
        periodo: saidaPeriodo(p),
        conversas_abertas: c.abertas,
        conversas_em_humano: c.em_humano,
        conversas_no_periodo: { ia: c.p_ia, humano: c.p_humano, encerrada: c.p_encerrada },
        pedidos_com_conversa: au.com_conversa,
        pedidos_sem_intervencao_humana: au.sem_humano,
        taxa_autonomia_ia: razao(au.sem_humano, au.com_conversa),
      }
    },
  }
}
