// Regras do onboarding. Sem Fastify: recebe pool e a loja ja resolvida pelo escopo.
import type { Pool } from '@whaviso/shared/db'
import { NaoEncontrado } from '../../shared/http_errors'
import * as repo from './repo'
import type { OnboardingEtapa, OnboardingSaida } from './schemas'

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null)

/** Funcao pura: monta o checklist e a metrica a partir dos sinais crus. */
export function montar(s: repo.SinaisLinha): OnboardingSaida {
  const etapas: OnboardingEtapa[] = [
    // Perfil: endereco informado e ao menos um dia aberto nos horarios (sem marco de data proprio).
    { chave: 'perfil', concluida: s.endereco_ok && s.horarios_ok, concluida_em: null },
    { chave: 'numero', concluida: s.numero_em !== null, concluida_em: iso(s.numero_em) },
    { chave: 'cardapio', concluida: s.cardapio_em !== null, concluida_em: iso(s.cardapio_em) },
    {
      chave: 'primeiro_pedido',
      concluida: s.primeiro_pedido_em !== null,
      concluida_em: iso(s.primeiro_pedido_em),
    },
  ]
  const concluidas = etapas.filter((e) => e.concluida).length
  const minutos = s.primeiro_pedido_em
    ? Math.max(0, Math.round((s.primeiro_pedido_em.getTime() - s.criado_em.getTime()) / 60_000))
    : null
  return {
    loja_id: s.loja_id,
    etapas,
    concluidas,
    total: etapas.length,
    percentual: Math.round((concluidas / etapas.length) * 100),
    completo: concluidas === etapas.length,
    iniciado_em: s.criado_em.toISOString(),
    primeiro_pedido_em: iso(s.primeiro_pedido_em),
    tempo_ate_primeiro_pedido_min: minutos,
  }
}

export async function obter(pool: Pool, lojaId: string): Promise<OnboardingSaida> {
  const s = await repo.sinais(pool, lojaId)
  if (!s) throw new NaoEncontrado()
  return montar(s)
}
