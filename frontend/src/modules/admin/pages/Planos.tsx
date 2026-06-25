// /admin/planos: catálogo de planos (GET /v1/billing/planos). Read-only para o
// owner. Mostra as alavancas de cada plano (agenda balde único, cadência, menu,
// confirmação, totais, recorrência). No Plus (por_envio) o preço é por VOLUME DE
// ENVIOS (faixa min..max; total do piso ao topo) e a capacidade escala com os
// envios. Valores em centavos via MoneyText. Linguagem das Regras de Ouro.
import { useState } from 'react'
import {
  Banner,
  Card,
  EmptyState,
  MoneyText,
  PageHeader,
  Skeleton,
} from '@/shared/ui'
import { brl } from '@/shared/format'
import type { Plano } from '@/shared/contracts'
import { useAdminPlanos } from '../api'
import { Indisponivel } from '../components/Indisponivel'

function LinhaRecurso({ rotulo, ativo }: { rotulo: string; ativo: boolean }) {
  return (
    <li>
      {rotulo}: <span className="text-tinta">{ativo ? 'sim' : 'não'}</span>
    </li>
  )
}

// Preço TOTAL (centavos) do Plus por volume de envios: espelho do backend
// (shared/planos.precoPorEnvioCentavos). Interpola o total entre piso e topo.
function precoEnvioCentavos(p: Plano, n: number): number {
  const lo = p.envios_min ?? 26
  const hi = p.envios_max ?? lo
  const pLo = p.preco_centavos
  const pHi = p.preco_max_centavos ?? pLo
  const nn = Math.min(Math.max(n, lo), hi)
  if (hi === lo) return pLo
  return Math.round(pLo + ((pHi - pLo) * (nn - lo)) / (hi - lo))
}

// Input range interativo: arraste para ver, ao vivo, o total/mês e o R$/envio em
// cada volume (a partir de envios_min). Bolha do valor acompanha o thumb.
function SliderEnvios({ plano }: { plano: Plano }) {
  const min = plano.envios_min ?? 26
  const max = plano.envios_max ?? 200
  const [envios, setEnvios] = useState(min)
  const total = precoEnvioCentavos(plano, envios)
  const porEnvio = brl(Math.round(total / envios))
  const pct = ((envios - min) / (max - min)) * 100

  return (
    <div className="flex flex-col gap-3 rounded-card bg-papel-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-baseline gap-1">
          <MoneyText centavos={total} className="font-display text-2xl text-tinta" />
          <span className="text-sm text-tinta-2">/mês</span>
        </span>
        <span className="text-sm text-tinta-2">{porEnvio} por envio</span>
      </div>

      <div className="relative pt-8">
        {/* Bolha do valor sobre o thumb (offset do thumb ~16px de largura). */}
        <div
          className="absolute top-0 -translate-x-1/2 rounded-pill bg-salvia px-2 py-0.5 text-xs font-medium text-papel"
          style={{ left: `calc(${pct}% + ${8 - (pct / 100) * 16}px)` }}
        >
          {envios}
        </div>
        <input
          type="range"
          min={min}
          max={max}
          value={envios}
          onChange={(e) => setEnvios(Number(e.target.value))}
          className="w-full cursor-pointer"
          style={{ accentColor: 'var(--color-salvia)' }}
          aria-label="Envios por mês"
        />
        <div className="mt-1 flex justify-between text-xs text-tinta-2">
          <span>{min} envios</span>
          <span>{max} envios</span>
        </div>
      </div>
    </div>
  )
}

function PlanoCard({ plano }: { plano: Plano }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg text-salvia">{plano.nome}</h2>
        {plano.por_envio ? (
          <span className="flex items-baseline gap-1">
            <MoneyText centavos={plano.preco_centavos} className="text-xl text-tinta" />
            <span className="text-xs text-tinta-2">a</span>
            <MoneyText centavos={plano.preco_max_centavos ?? plano.preco_centavos} className="text-xl text-tinta" />
          </span>
        ) : (
          <MoneyText centavos={plano.preco_centavos} className="text-xl text-tinta" />
        )}
      </div>
      {plano.por_envio && <SliderEnvios plano={plano} />}
      <ul className="flex flex-col gap-1 text-sm text-tinta-2">
        {plano.por_envio && (
          <li>
            Modelo: <span className="text-tinta">por volume de envios</span>
          </li>
        )}
        <li>
          Capacidade de agenda:{' '}
          <span className="text-tinta">
            {plano.por_envio
              ? 'escala com os envios'
              : plano.por_unidade
                ? `${plano.agenda_por_unidade} por unidade`
                : plano.capacidade_agenda}
          </span>
        </li>
        <li>
          Envios de aviso (vagas ativas):{' '}
          <span className="text-tinta">
            {plano.somente_leitura
              ? '0 (somente leitura)'
              : plano.por_envio
                ? 'escala com os envios'
                : plano.por_unidade
                  ? `${plano.ativaveis_por_unidade} por unidade`
                  : plano.vagas_ativas != null
                    ? `${plano.vagas_ativas} ao mesmo tempo`
                    : 'dentro da agenda'}
          </span>
        </li>
        <LinhaRecurso rotulo="Lembretes recorrentes" ativo={plano.permite_recorrente} />
        <LinhaRecurso rotulo="Cadência configurável" ativo={plano.cadencia_configuravel} />
        <LinhaRecurso rotulo="Menu de texto livre" ativo={plano.menu_texto_livre} />
        <LinhaRecurso rotulo="Confirmação de pagamento" ativo={plano.informado_pago_habilitado} />
      </ul>
    </Card>
  )
}

export default function PlanosAdminPage() {
  const { data, isLoading, isError } = useAdminPlanos()

  return (
    <div className="animate-rise">
      <PageHeader titulo="Planos" descricao="Os planos oferecidos no whaviso." />

      {isError ? (
        <EmptyState
          titulo="Não foi possível carregar os planos"
          descricao="Verifique sua conexão e tente novamente."
        />
      ) : isLoading || !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-card" />
          ))}
        </div>
      ) : data.indisponivel ? (
        <Indisponivel descricao="A api de planos (GET /v1/billing/planos) não respondeu. Verifique o backend e tente de novo." />
      ) : data.dados!.planos.length === 0 ? (
        <EmptyState titulo="Nenhum plano cadastrado" descricao="Cadastre planos no backend para que apareçam aqui." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {data.dados!.planos.map((p) => (
              <PlanoCard key={p.id} plano={p} />
            ))}
          </div>

          <Banner tom="info" className="mt-6">
            A edição de planos pelo painel ainda não está disponível na api. Esta
            visão é somente leitura.
          </Banner>
        </>
      )}
    </div>
  )
}
