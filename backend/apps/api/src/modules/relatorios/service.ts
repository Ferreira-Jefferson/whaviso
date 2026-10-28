// Regra dos relatorios (read-model). Sem acesso HTTP; erros de dominio via shared/http_errors.
// Rotulos legiveis e razoes (0..1) calculados aqui; o banco so agrega.
import type { Pool } from '@whaviso/shared/db'
import { hojeSp } from '@whaviso/shared/datas'
import { HttpError } from '../../shared/http_errors'
import { normalizarPeriodo, PeriodoInvalido, type Periodo } from './periodo'
import * as repo from './repo'
import type {
  CancelamentosFiltro, CancelamentosSaida, CoortesSaida, FormasPagamentoSaida, RelatorioPeriodo, VendasFiltro,
  VendasSaida,
} from './schemas'

export interface Ator {
  lojaId: string
}

const DIAS = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado']

function periodoDe(f: { de?: string | undefined; ate?: string | undefined }): Periodo {
  try {
    return normalizarPeriodo(f.de, f.ate)
  } catch (e) {
    if (e instanceof PeriodoInvalido) throw new HttpError(400, 'periodo_invalido', e.message)
    throw e
  }
}

const janela = (a: Ator, p: Periodo): repo.Janela => ({ lojaId: a.lojaId, inicio: p.inicio, fim: p.fim })
const saidaPeriodo = (p: Periodo) => ({ de: p.de, ate: p.ate })
const razao = (parte: number, total: number): number | null => (total > 0 ? parte / total : null)

function rotulo(dim: VendasFiltro['agrupar_por'], chave: string): string {
  if (dim === 'hora') return `${chave}h`
  if (dim === 'dia_semana') return DIAS[Number(chave)] ?? chave
  return chave
}

/** Meses inteiros entre 'YYYY-MM' e 'YYYY-MM'. */
function mesesEntre(de: string, ate: string): number {
  const [a1, m1] = de.split('-').map(Number)
  const [a2, m2] = ate.split('-').map(Number)
  return (a2! - a1!) * 12 + (m2! - m1!)
}

export function criarServicoRelatorios(pool: Pool) {
  return {
    async vendas(a: Ator, f: VendasFiltro): Promise<VendasSaida> {
      const p = periodoDe(f)
      const j = janela(a, p)
      // `mesa` vem do salao: seu universo (totais) sao comandas fechadas, nao pedidos entregues.
      const totalDe = f.agrupar_por === 'mesa' ? repo.totalComandas : repo.totalVendas
      const [linhas, tot] = await Promise.all([
        repo.vendasPorDimensao(pool, j, f.agrupar_por, f.limite),
        totalDe(pool, j),
      ])
      // Dimensoes de linha de item (receita da linha, nao do pedido): sem ticket, com unidades.
      const porItem = f.agrupar_por === 'item' || f.agrupar_por === 'categoria' || f.agrupar_por === 'tamanho'
      return {
        periodo: saidaPeriodo(p),
        agrupar_por: f.agrupar_por,
        linhas: linhas.map((l) => ({
          chave: l.chave,
          rotulo: l.rotulo ?? rotulo(f.agrupar_por, l.chave),
          pedidos: l.pedidos,
          quantidade: l.quantidade,
          faturamento_centavos: l.faturamento,
          ticket_medio_centavos: porItem ? null : l.pedidos > 0 ? Math.round(l.faturamento / l.pedidos) : null,
          participacao: razao(l.faturamento, l.total_grupo),
        })),
        total_pedidos: tot.pedidos,
        total_faturamento_centavos: tot.faturamento,
      }
    },

    async formasPagamento(a: Ator, f: RelatorioPeriodo): Promise<FormasPagamentoSaida> {
      const p = periodoDe(f)
      const linhas = await repo.formasPagamento(pool, janela(a, p))
      const total = linhas.reduce((s, l) => s + l.valor, 0)
      return {
        periodo: saidaPeriodo(p),
        linhas: linhas.map((l) => ({
          forma: l.forma as FormasPagamentoSaida['linhas'][number]['forma'],
          transacoes: l.transacoes,
          valor_centavos: l.valor,
          participacao: razao(l.valor, total),
        })),
        total_centavos: total,
      }
    },

    async cancelamentos(a: Ator, f: CancelamentosFiltro): Promise<CancelamentosSaida> {
      const p = periodoDe(f)
      const j = janela(a, p)
      const [t, motivos] = await Promise.all([
        repo.cancelamentoTotais(pool, j),
        repo.motivosProblema(pool, j, f.limite),
      ])
      return {
        periodo: saidaPeriodo(p),
        total_pedidos: t.pedidos,
        total_problemas: t.problemas,
        taxa_problema: razao(t.problemas, t.pedidos),
        valor_perdido_centavos: t.valor_perdido,
        motivos: motivos.map((m) => ({ motivo: m.motivo, pedidos: m.pedidos, valor_centavos: m.valor })),
      }
    },

    async coortes(a: Ator, f: RelatorioPeriodo): Promise<CoortesSaida> {
      const p = periodoDe(f)
      const linhas = await repo.coortes(pool, a.lojaId, p.de, p.ate)
      const mesAtual = hojeSp().slice(0, 7)
      const porCoorte = new Map<string, Map<number, number>>()
      for (const l of linhas) {
        const m = porCoorte.get(l.coorte) ?? new Map<number, number>()
        m.set(l.offset, l.clientes)
        porCoorte.set(l.coorte, m)
      }
      return {
        periodo: saidaPeriodo(p),
        coortes: [...porCoorte.entries()].map(([mes, m]) => {
          const base = m.get(0) ?? 0
          const limite = Math.min(12, Math.max(0, mesesEntre(mes, mesAtual)))
          return {
            mes,
            clientes: base,
            retencao: Array.from({ length: limite + 1 }, (_, offset) => {
              const clientes = m.get(offset) ?? 0
              return { offset, clientes, taxa: razao(clientes, base) }
            }),
          }
        }),
      }
    },
  }
}
