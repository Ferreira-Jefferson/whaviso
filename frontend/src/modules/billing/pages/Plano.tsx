// /app/plano: plano vigente, catálogo dos 4 planos (Free/Start/Profissional/Plus),
// contador de uso da AGENDA vs capacidade e CTA de upgrade. O limite é DECIDIDO
// PELO BACKEND (risco nº 7): aqui só espelhamos o contador (uso = avisos no ciclo +
// aguardando aceite, vindo do painel/resumo) e as alavancas de cada plano. Não
// reimplementamos a regra; quem recusa é a api (plano_somente_leitura / agenda_cheia,
// tratados no formulário de novo aviso, que traz um link pra cá).
// Linguagem das Regras de Ouro: só "aviso/lembrete/combinado/assinatura/plano".
//
// Plus é vendido por VOLUME DE ENVIOS (de envios_min a envios_max): o cliente
// escolhe quantos envios de aviso quer e o R$/envio cai com o volume; capacidade e
// vagas de aviso ativo escalam 1:1 com os envios escolhidos.
import { useState } from 'react'
import { Check, Minus, Sparkles } from 'lucide-react'
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  MoneyText,
  PageHeader,
  Skeleton,
} from '@/shared/ui'
import { ApiError } from '@/shared/api_client'
import type { Plano } from '@/shared/contracts'
import { brl } from '@/shared/format'
import { useAssinar, useAssinatura, usePlanos, useUsoAtivos } from '../api'

// Escolha em confirmação: o plano e, no Plus, a quantidade de envios/mês.
interface Escolha {
  plano: Plano
  unidades?: number
}

type PlanoId = 'free' | 'start' | 'profissional' | 'plus'

// Preço TOTAL (centavos) do Plus por volume de envios: espelho do backend
// (shared/planos.precoPorEnvioCentavos). Interpola o total entre o piso e o topo
// publicados no catálogo. O backend recomputa o congelado ao assinar (fonte única);
// aqui é só exibição. `n` é grampeado na faixa.
function precoEnvioCentavos(plano: Plano, n: number): number {
  const lo = plano.envios_min ?? 1
  const hi = plano.envios_max ?? lo
  const pLo = plano.preco_centavos
  const pHi = plano.preco_max_centavos ?? pLo
  const nn = Math.min(Math.max(n, lo), hi)
  if (hi === lo) return pLo
  return Math.round(pLo + ((pHi - pLo) * (nn - lo)) / (hi - lo))
}

export default function PlanoPage() {
  const planos = usePlanos()
  const assinatura = useAssinatura()
  const uso = useUsoAtivos()
  const assinar = useAssinar()

  const [aConfirmar, setAConfirmar] = useState<Escolha | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const planoAtualId = assinatura.data?.plano_id ?? null

  async function confirmarTroca() {
    if (!aConfirmar) return
    setErro(null)
    setFeedback(null)
    const { plano, unidades } = aConfirmar
    try {
      await assinar.mutateAsync(
        plano.por_unidade
          ? { plano_id: 'plus', unidades }
          : { plano_id: plano.id as PlanoId },
      )
      setFeedback(`Plano alterado para ${plano.nome}.`)
      setAConfirmar(null)
    } catch (e) {
      setErro(
        e instanceof ApiError
          ? e.message
          : 'Não foi possível alterar o plano. Tente novamente.',
      )
      setAConfirmar(null)
    }
  }

  // Capacidade efetiva da agenda do plano atual (espelho do backend; já resolvida
  // por unidade no Plus).
  const capacidadeAtual = assinatura.data?.capacidade_agenda ?? null
  const usoAgenda = uso.data ?? 0

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Meu plano"
        descricao="Acompanhe seu uso e escolha o plano que combina com você."
      />

      {feedback && (
        <Banner tom="sucesso" className="mb-4">
          {feedback}
        </Banner>
      )}
      {erro && (
        <Banner tom="erro" className="mb-4">
          {erro}
        </Banner>
      )}

      {/* Uso da agenda vs capacidade (espelho do backend) */}
      <ContadorUso
        carregando={uso.isLoading || assinatura.isLoading || planos.isLoading}
        erro={uso.isError}
        uso={usoAgenda}
        capacidade={capacidadeAtual}
        somenteLeitura={assinatura.data?.somente_leitura ?? false}
        statusAssinatura={assinatura.data?.status}
        temPlanoMaior={Boolean(
          planos.data?.some(
            (p) =>
              p.id !== planoAtualId &&
              (p.por_unidade || p.capacidade_agenda > (capacidadeAtual ?? 0)),
          ),
        )}
      />

      {/* Catálogo de planos */}
      <h2 className="mt-8 mb-4 text-lg text-salvia">Planos</h2>
      {planos.isError ? (
        <EmptyState
          titulo="Não foi possível carregar os planos"
          descricao="Verifique sua conexão e tente novamente."
          acao={
            <Button variante="secondary" onClick={() => planos.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      ) : planos.isLoading || !planos.data ? (
        <div className="grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-80 w-full rounded-card" />
          <Skeleton className="h-80 w-full rounded-card" />
          <Skeleton className="h-80 w-full rounded-card" />
          <Skeleton className="h-80 w-full rounded-card" />
        </div>
      ) : (
        <div className="grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {planos.data.map((plano) =>
            plano.por_envio ? (
              <CartaoPlus
                key={plano.id}
                plano={plano}
                ehAtual={plano.id === planoAtualId}
                onEscolher={(envios) => setAConfirmar({ plano, unidades: envios })}
                alterando={assinar.isPending}
              />
            ) : (
              <CartaoPlano
                key={plano.id}
                plano={plano}
                ehAtual={plano.id === planoAtualId}
                destaque={plano.id === 'profissional'}
                onEscolher={() => setAConfirmar({ plano })}
                alterando={assinar.isPending}
              />
            ),
          )}
        </div>
      )}

      <ConfirmDialog
        aberto={aConfirmar !== null}
        titulo="Confirmar mudança de plano"
        textoConfirmar="Confirmar"
        carregando={assinar.isPending}
        onConfirmar={() => void confirmarTroca()}
        onCancelar={() => setAConfirmar(null)}
      >
        {aConfirmar && (
          <span>
            Você passará para o <strong>{aConfirmar.plano.nome}</strong>
            {aConfirmar.plano.por_envio ? (
              <>
                {' '}
                com {aConfirmar.unidades} envios por mês (
                <MoneyText
                  centavos={precoEnvioCentavos(aConfirmar.plano, aConfirmar.unidades ?? 0)}
                  className="text-sm"
                />{' '}
                por mês).
              </>
            ) : aConfirmar.plano.preco_centavos > 0 ? (
              <>
                {' '}
                (<MoneyText centavos={aConfirmar.plano.preco_centavos} className="text-sm" /> por mês).
              </>
            ) : (
              '.'
            )}{' '}
            No MVP não há pagamento automático: sua escolha entra como cortesia.
          </span>
        )}
      </ConfirmDialog>
    </div>
  )
}

// ---------------------------------------------------------------------------

function ContadorUso({
  carregando,
  erro,
  uso,
  capacidade,
  somenteLeitura,
  statusAssinatura,
  temPlanoMaior,
}: {
  carregando: boolean
  erro: boolean
  uso: number
  capacidade: number | null
  somenteLeitura: boolean
  statusAssinatura?: string
  temPlanoMaior: boolean
}) {
  if (carregando) return <Skeleton className="h-28 w-full rounded-card" />

  if (capacidade === null) {
    return (
      <Card className="flex flex-col gap-2">
        <span className="text-sm text-tinta-2">Itens na agenda</span>
        <span className="font-display text-2xl text-salvia">{erro ? '' : uso}</span>
      </Card>
    )
  }

  const restantes = Math.max(0, capacidade - uso)
  const noLimite = uso >= capacidade
  const perto = !noLimite && restantes <= 1
  const pct = Math.min(100, Math.round((uso / capacidade) * 100))

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-tinta-2">Itens na agenda</span>
        <span className="tabular text-lg text-tinta">
          {erro ? '' : `${uso} de ${capacidade}`}
        </span>
      </div>

      {/* Barra de uso (CSS puro, tom suave; nunca vermelho-alerta) */}
      <div
        className="h-2 w-full overflow-hidden rounded-pill bg-papel-2"
        role="progressbar"
        aria-valuenow={uso}
        aria-valuemin={0}
        aria-valuemax={capacidade}
        aria-label="Itens na agenda do plano"
      >
        <div
          className={
            noLimite
              ? 'h-full rounded-pill bg-barro/70'
              : perto
                ? 'h-full rounded-pill bg-ambar'
                : 'h-full rounded-pill bg-folha'
          }
          style={{ width: `${erro ? 0 : pct}%` }}
        />
      </div>

      {/* Free: mantém agenda e visualiza, mas não envia. CTA de upgrade discreta. */}
      {!erro && somenteLeitura && (
        <Banner tom="info">
          Seu plano mantém a agenda e a visualização, mas não envia avisos. Para
          ativar os envios, escolha um plano abaixo. Nada do que você já anotou se perde.
        </Banner>
      )}
      {!erro && !somenteLeitura && noLimite && temPlanoMaior && (
        <Banner tom="info">
          Sua agenda chegou ao limite do plano. Para anotar mais combinados, escolha
          um plano maior abaixo, ou arquive um item que já encerrou.
        </Banner>
      )}
      {!erro && !somenteLeitura && perto && temPlanoMaior && (
        <p className="text-xs text-tinta-2">
          Resta {restantes} item na sua agenda. Que tal um plano maior?
        </p>
      )}
      {!erro && !somenteLeitura && !noLimite && !perto && (
        <p className="text-xs text-tinta-2">Restam {restantes} itens na sua agenda.</p>
      )}
      {statusAssinatura === 'cancelada' && (
        <Banner tom="erro">
          Sua assinatura está encerrada. Escolha um plano abaixo para retomar.
        </Banner>
      )}
    </Card>
  )
}

function Recurso({ ativo, rotulo }: { ativo: boolean; rotulo: string }) {
  return (
    <li className="flex items-center gap-2">
      {ativo ? (
        <Check strokeWidth={1.75} className="size-4 text-folha" />
      ) : (
        <Minus strokeWidth={1.75} className="size-4 shrink-0 text-tinta-2" />
      )}
      <span className={ativo ? '' : 'text-tinta-2'}>{rotulo}</span>
    </li>
  )
}

// Cabeçalho comum dos cartões: faixa de destaque/atual + nome. Mantém todos os
// cartões alinhados (mesma altura de topo) numa grade de colunas.
function FaixaCartao({ destaque, ehAtual }: { destaque?: boolean; ehAtual: boolean }) {
  if (ehAtual) {
    return (
      <span className="self-start rounded-pill bg-salvia-claro px-3 py-1 text-xs font-medium text-salvia">
        Plano atual
      </span>
    )
  }
  if (destaque) {
    return (
      <span className="inline-flex items-center gap-1 self-start rounded-pill bg-salvia px-3 py-1 text-xs font-medium text-papel">
        <Sparkles strokeWidth={2} className="size-3" />
        Mais popular
      </span>
    )
  }
  return <span className="text-xs text-transparent">.</span>
}

function CartaoPlano({
  plano,
  ehAtual,
  destaque,
  onEscolher,
  alterando,
}: {
  plano: Plano
  ehAtual: boolean
  destaque?: boolean
  onEscolher: () => void
  alterando: boolean
}) {
  const borda = destaque
    ? 'border-salvia ring-2 ring-salvia/40'
    : ehAtual
      ? 'border-salvia ring-1 ring-salvia/30'
      : ''
  return (
    <Card className={`flex h-full flex-col gap-4 ${borda}`}>
      <FaixaCartao destaque={destaque} ehAtual={ehAtual} />

      <div>
        <h3 className="text-lg text-salvia">{plano.nome}</h3>
        <p className="mt-2 flex items-baseline gap-1">
          <MoneyText centavos={plano.preco_centavos} className="font-display text-3xl text-tinta" />
          {plano.preco_centavos > 0 && <span className="text-sm text-tinta-2">/mês</span>}
        </p>
      </div>

      <ul className="flex flex-1 flex-col gap-2 text-sm text-tinta">
        <Recurso
          ativo={(plano.vagas_ativas ?? 0) > 0}
          rotulo={`${plano.vagas_ativas ?? 0} envios de aviso`}
        />
        <li className="flex items-center gap-2">
          <Check strokeWidth={1.75} className="size-4 shrink-0 text-folha" />
          {`Agenda de até ${plano.capacidade_agenda} itens`}
        </li>
        <Recurso
          ativo={!plano.somente_leitura}
          rotulo={plano.somente_leitura ? 'Visualização (sem enviar avisos)' : 'Avisos automáticos no WhatsApp'}
        />
        <Recurso ativo={plano.permite_recorrente} rotulo="Combinados recorrentes" />
        <Recurso ativo={plano.cadencia_configuravel} rotulo="Cadência configurável" />
      </ul>

      <div className="pt-2">
        {ehAtual ? (
          <Button variante="secondary" disabled className="w-full">
            Seu plano atual
          </Button>
        ) : (
          <Button
            variante={destaque ? 'primary' : 'secondary'}
            onClick={onEscolher}
            loading={alterando}
            className="w-full"
          >
            Escolher {plano.nome}
          </Button>
        )}
      </div>
    </Card>
  )
}

function CartaoPlus({
  plano,
  ehAtual,
  onEscolher,
  alterando,
}: {
  plano: Plano
  ehAtual: boolean
  onEscolher: (envios: number) => void
  alterando: boolean
}) {
  const min = plano.envios_min ?? 26
  const max = plano.envios_max ?? 200
  const [envios, setEnvios] = useState(() => Math.min(Math.max(50, min), max))
  const total = precoEnvioCentavos(plano, envios)
  const porEnvio = brl(Math.round(total / envios))

  return (
    <Card className={`flex h-full flex-col gap-4 border-salvia ${ehAtual ? 'ring-1 ring-salvia/30' : 'ring-2 ring-salvia/40'}`}>
      <FaixaCartao ehAtual={ehAtual} destaque={!ehAtual} />

      <div>
        <h3 className="text-lg text-salvia">{plano.nome}</h3>
        <p className="mt-2 flex items-baseline gap-1">
          <MoneyText centavos={total} className="font-display text-3xl text-tinta" />
          <span className="text-sm text-tinta-2">/mês</span>
        </p>
        <p className="mt-1 text-xs text-tinta-2">
          {porEnvio} por envio · quanto mais envios, mais barato cada um
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-card bg-papel-2 p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-tinta-2">Envios por mês</span>
          <span className="tabular text-lg text-salvia">{envios}</span>
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
        <div className="flex justify-between text-xs text-tinta-2">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>

      <ul className="flex flex-1 flex-col gap-2 text-sm text-tinta">
        <li className="flex items-center gap-2">
          <Check strokeWidth={1.75} className="size-4 shrink-0 text-folha" />
          {`Até ${envios} envios por mês`}
        </li>
        <Recurso ativo rotulo="Avisos automáticos no WhatsApp" />
        <Recurso ativo={plano.permite_recorrente} rotulo="Combinados recorrentes" />
        <Recurso ativo={plano.cadencia_configuravel} rotulo="Cadência configurável" />
      </ul>

      <div className="pt-2">
        {ehAtual ? (
          <Button variante="secondary" disabled className="w-full">
            Seu plano atual
          </Button>
        ) : (
          <Button onClick={() => onEscolher(envios)} loading={alterando} className="w-full">
            <Sparkles strokeWidth={1.75} className="size-4" />
            Escolher {plano.nome}
          </Button>
        )}
      </div>
    </Card>
  )
}
