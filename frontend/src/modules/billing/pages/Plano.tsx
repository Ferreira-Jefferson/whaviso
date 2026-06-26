// /app/plano: tela de planos do USUÁRIO. Os cartões são os MESMOS da landing
// (shared/plano/CartoesPlanos), para as duas telas ficarem iguais; aqui a CTA de
// cada cartão escolhe/troca o plano (ou mostra "Seu plano atual"). Acima dos
// cartões fica o contador de uso da agenda vs capacidade do plano vigente.
// O limite é DECIDIDO PELO BACKEND (risco nº 7): aqui só espelhamos o contador
// (uso = avisos no ciclo + aguardando aceite) e deixamos a api recusar
// (plano_somente_leitura / agenda_cheia) no formulário de novo aviso.
// Linguagem das Regras de Ouro: só "aviso/lembrete/combinado/assinatura/plano".
//
// Plus é vendido por VOLUME DE ENVIOS: o slider do cartão (compartilhado) define o
// nº de envios; o backend recomputa o preço congelado ao assinar (fonte única).
import { useState } from 'react'
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
import { CartoesPlanos, precoEnvioCentavos } from '@/shared/plano'
import { ApiError } from '@/shared/api_client'
import type { Plano } from '@/shared/contracts'
import { useAssinar, useAssinatura, usePlanos, useUsoAtivos } from '../api'

// Escolha em confirmação: o plano e, no Plus, a quantidade de envios/mês.
interface Escolha {
  plano: Plano
  unidades?: number
}

type PlanoId = 'free' | 'start' | 'profissional' | 'plus'

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
        plano.por_envio
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

      <div className="flex flex-col gap-4">
        {/* Envios de aviso ATIVOS (vagas) vs o teto do plano: quantos envios ainda
            restam. Vem ANTES da agenda (é o eixo comercial). Espelho do backend
            (vagas_usadas/vagas_ativas), nunca recalculado. */}
        <ContadorEnvios
          carregando={assinatura.isLoading || planos.isLoading}
          erro={assinatura.isError}
          usados={assinatura.data?.vagas_usadas ?? 0}
          vagas={assinatura.data?.vagas_ativas ?? 0}
          somenteLeitura={assinatura.data?.somente_leitura ?? false}
          temPlanoMaior={Boolean(
            planos.data?.some((p) => p.id !== planoAtualId && p.por_envio),
          )}
        />

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
                (p.por_envio || p.capacidade_agenda > (capacidadeAtual ?? 0)),
            ),
          )}
        />
      </div>

      {/* Catálogo de planos: MESMOS cartões da landing */}
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
        <CartoesPlanos
          planos={planos.data}
          planoAtualId={planoAtualId}
          renderCta={(p, envios) =>
            p.id === planoAtualId ? (
              // Plano vigente: contorno salvia para destacar (ghost não traz borda
              // própria, então não briga com a cor; secondary fixaria border-linha).
              <Button
                variante="ghost"
                disabled
                className="w-full border border-salvia text-salvia"
              >
                Seu plano atual
              </Button>
            ) : (
              <Button
                variante={p.id === 'profissional' || p.por_envio ? 'primary' : 'secondary'}
                onClick={() => setAConfirmar({ plano: p, unidades: envios ?? undefined })}
                loading={assinar.isPending}
                className="w-full"
              >
                Escolher {p.nome}
              </Button>
            )
          }
        />
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

// ---------------------------------------------------------------------------

// Contador de ENVIOS DE AVISO ATIVOS (vagas): quantos envios já estão ativos vs o teto
// do plano, e quantos ainda restam. No Free (não envia) mostra só a explicação. Espelho
// do backend (vagas_usadas/vagas_ativas), nunca recalcula a regra (risco nº 7).
function ContadorEnvios({
  carregando,
  erro,
  usados,
  vagas,
  somenteLeitura,
  temPlanoMaior,
}: {
  carregando: boolean
  erro: boolean
  usados: number
  vagas: number
  somenteLeitura: boolean
  temPlanoMaior: boolean
}) {
  if (carregando) return <Skeleton className="h-24 w-full rounded-card" />

  // Free / somente leitura: o plano não envia, então não há vagas a consumir.
  if (!erro && (somenteLeitura || vagas <= 0)) {
    return (
      <Card className="flex flex-col gap-1">
        <span className="text-sm text-tinta-2">Envios de aviso ativos</span>
        <span className="text-sm text-tinta">
          Seu plano não envia avisos. Escolha um plano abaixo para ativar os envios.
        </span>
      </Card>
    )
  }

  const restantes = Math.max(0, vagas - usados)
  const noLimite = usados >= vagas
  const perto = !noLimite && restantes <= Math.max(1, Math.round(vagas * 0.1))
  const pct = vagas > 0 ? Math.min(100, Math.round((usados / vagas) * 100)) : 0

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-tinta-2">Envios de aviso ativos</span>
        <span className="tabular text-lg text-tinta">
          {erro ? '' : `${usados} de ${vagas}`}
        </span>
      </div>

      {/* Barra de uso (CSS puro, tom suave; nunca vermelho-alerta) */}
      <div
        className="h-2 w-full overflow-hidden rounded-pill bg-papel-2"
        role="progressbar"
        aria-valuenow={usados}
        aria-valuemin={0}
        aria-valuemax={vagas}
        aria-label="Envios de aviso ativos no plano"
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

      {!erro && noLimite && temPlanoMaior && (
        <Banner tom="info">
          Você está usando todos os envios do seu plano. Para ativar mais combinados,
          escolha um plano maior abaixo, ou encerre um que já recebeu.
        </Banner>
      )}
      {!erro && !noLimite && (
        <p className="text-xs text-tinta-2">
          {restantes === 1
            ? 'Resta 1 envio disponível.'
            : `Restam ${restantes} envios disponíveis.`}
        </p>
      )}
    </Card>
  )
}
