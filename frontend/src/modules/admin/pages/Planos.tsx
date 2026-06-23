// /admin/planos: catálogo de planos (GET /v1/billing/planos). Read-only para o
// owner. Mostra as alavancas de cada plano (agenda balde único, cadência, menu,
// confirmação, totais, recorrência). No Plus (por_unidade) o preço é por UNIDADE
// e a agenda é por unidade. Valores em centavos via MoneyText. Linguagem das
// Regras de Ouro em toda string.
import {
  Banner,
  Card,
  EmptyState,
  MoneyText,
  PageHeader,
  Skeleton,
} from '@/shared/ui'
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

function PlanoCard({ plano }: { plano: Plano }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg text-salvia">{plano.nome}</h2>
        <span className="flex items-baseline gap-1">
          <MoneyText centavos={plano.preco_centavos} className="text-xl text-tinta" />
          {plano.por_unidade && <span className="text-xs text-tinta-2">/unidade</span>}
        </span>
      </div>
      <ul className="flex flex-col gap-1 text-sm text-tinta-2">
        <li>
          Capacidade de agenda:{' '}
          <span className="text-tinta">
            {plano.por_unidade
              ? `${plano.agenda_por_unidade} por unidade`
              : plano.capacidade_agenda}
          </span>
        </li>
        <li>
          Avisos ativos:{' '}
          <span className="text-tinta">
            {plano.somente_leitura
              ? 'somente leitura (não ativa)'
              : plano.por_unidade
                ? `${plano.ativaveis_por_unidade} por unidade`
                : 'dentro da agenda'}
          </span>
        </li>
        <LinhaRecurso rotulo="Lembretes recorrentes" ativo={plano.permite_recorrente} />
        <LinhaRecurso rotulo="Cadência configurável" ativo={plano.cadencia_configuravel} />
        <LinhaRecurso rotulo="Menu de texto livre" ativo={plano.menu_texto_livre} />
        <LinhaRecurso rotulo="Confirmação de pagamento" ativo={plano.informado_pago_habilitado} />
        <LinhaRecurso rotulo="Totais por período" ativo={plano.totais_periodo} />
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
