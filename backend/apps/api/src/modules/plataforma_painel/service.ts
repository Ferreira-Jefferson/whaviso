// Regra do painel de crescimento do operador. Sem acesso HTTP aqui. So agregados: nenhum dado de
// loja (conteudo, contato, uso) entra no payload nem em log. Cache em memoria por processo
// (60 s por chave de consulta, sem Redis): o painel nao e tempo real e `calculado_em` informa a idade.
import type { Pool } from '@whaviso/shared/db'
import * as m from './metricas'
import * as repo from './repo'
import type { Resumo, Serie } from './schemas'

export const TTL_CACHE_MS = 60_000

export interface OpcoesPainel {
  /** TTL do cache em ms (testes usam 0 para sempre recalcular). */
  ttlMs?: number
  agora?: () => number
}

export function criarServicoPainel(pool: Pool, opcoes: OpcoesPainel = {}) {
  const ttl = opcoes.ttlMs ?? TTL_CACHE_MS
  const agora = opcoes.agora ?? Date.now
  const cache = new Map<string, { expira: number; valor: unknown }>()

  async function comCache<T>(chave: string, calcular: () => Promise<T>): Promise<T> {
    const hit = cache.get(chave)
    if (hit && hit.expira > agora()) return hit.valor as T
    const valor = await calcular()
    if (ttl > 0) cache.set(chave, { expira: agora() + ttl, valor })
    return valor
  }

  return {
    resumo(): Promise<Resumo> {
      return comCache('resumo', async () => {
        const [ass, lojasAtivas, novasContas, fat, funil] = await Promise.all([
          repo.agregarAssinaturas(pool),
          repo.contarLojasAtivas(pool),
          repo.contarNovasContasMes(pool),
          repo.agregarFaturas(pool),
          repo.agregarFunil(pool),
        ])
        return {
          calculado_em: new Date(agora()).toISOString(),
          mes: ass.mes,
          mrr_centavos: ass.mrr_centavos,
          arpa_centavos: m.arpa(ass.mrr_centavos, ass.contas_ativas),
          lojas_ativas: lojasAtivas,
          contas_ativas: ass.contas_ativas,
          assinaturas: {
            trial: ass.trial, ativa: ass.ativa, suspensa: ass.suspensa, cancelada: ass.cancelada,
          },
          novas_contas_mes: novasContas,
          churn_contas: m.churnContas(ass.cancel_mes, ass.ativas_inicio),
          churn_mrr: m.churnMrr(ass.mrr_cancel_mes_centavos, ass.mrr_inicio_centavos),
          inadimplencia: {
            valor_centavos: fat.inadimplencia_centavos, contas: fat.inadimplencia_contas,
          },
          receita_realizada_centavos: fat.receita_mes_centavos,
          conversao_funil: m.conversaoFunil(funil.ativos, funil.criados),
          conversao_trial: m.conversaoTrial(ass.trials_convertidos, ass.trials_encerrados),
        }
      })
    },

    serie(meses: number): Promise<Serie> {
      return comCache(`serie:${meses}`, async () => {
        const linhas = await repo.serieMensal(pool, meses)
        return {
          calculado_em: new Date(agora()).toISOString(),
          mrr_aproximado: true,
          meses: linhas.map((l) => ({
            mes: l.mes,
            mrr_centavos: l.mrr_centavos,
            assinaturas_ativas: l.assinaturas_ativas,
            novas_contas: l.novas_contas,
            cancelamentos: l.cancelamentos,
            churn_contas: m.churnContas(l.cancelamentos, l.ativas_inicio),
            receita_realizada_centavos: l.receita_centavos,
          })),
        }
      })
    },
  }
}
