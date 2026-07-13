// /meus/combinados/:id: detalhe do combinado sob a ótica do DEVEDOR.
// - Dados: valor, data, motivo, quem convidou (cobrador), Pix (o backend expõe a
//   chave ao devedor em GET /v1/avisos/:id; é o que ele precisa para pagar).
// - CycleTimeline a partir dos ENVIOS REAIS (etapa nunca calculada no cliente);
//   degradação graciosa em 404 (backend ainda não expõe /envios, igual à Fase 4).
// - Histórico de eventos (in-app, risco nº 10) com a mesma degradação.
// - Ações: "Já paguei" (POST .../marcar-pago-devedor, programado→informado_pago) e "Encerrar
//   lembretes" (opt-out logado: rota inexistente no backend; degrada honesto).
// "Já paguei" → marco da fase: card "aguardando confirmação do cobrador".
// Idempotência → recibo (200), nunca erro. Linguagem: só combinado/lembrete/já paguei.
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  ArrowLeft,
  CheckCircle2,
  BellOff,
  History,
  AlertTriangle,
  Copy,
  Check,
  Hourglass,
} from 'lucide-react'
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  CycleTimeline,
  EmptyState,
  MoneyText,
  PageHeader,
  Skeleton,
  StatusBadge,
} from '@/shared/ui'
import { ROTULO_EVENTO, dataPtBR, dataHoraPtBR } from '@/shared/format'
import type { Aviso, EventoAviso, AtorEvento } from '@/shared/contracts'
import {
  useMeuCombinado,
  useMeusEnvios,
  useMeusEventos,
  useMarcarPago,
  useEncerrarLembretes,
} from '../api'

// Rótulo do ator de um evento, sob a ótica do DEVEDOR (em shared/format o mapa é
// sob a ótica do cobrador, "Você"/"A pessoa" invertidos). Aqui é local ao módulo.
const ROTULO_ATOR_DEVEDOR: Record<AtorEvento, string> = {
  cobrador: 'Quem te convidou',
  devedor: 'Você',
  sistema: 'Sistema',
  admin: 'Administração',
}

export default function DetalheCombinadoPage() {
  const { id = '' } = useParams()
  const combinado = useMeuCombinado(id)

  if (combinado.isLoading) {
    return (
      <div className="animate-rise flex flex-col gap-4">
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
    )
  }

  if (combinado.isError || !combinado.data) {
    return (
      <div className="animate-rise">
        <EmptyState
          titulo="Combinado não encontrado"
          descricao="Ele pode ter sido removido ou o endereço está incorreto."
          acao={
            <Link to="/meus" className="text-sm font-medium text-salvia hover:underline">
              Voltar para meus combinados
            </Link>
          }
        />
      </div>
    )
  }

  return <Conteudo id={id} aviso={combinado.data} />
}

function Conteudo({ id, aviso }: { id: string; aviso: Aviso }) {
  const envios = useMeusEnvios(id)
  const eventos = useMeusEventos(id)
  const marcarPago = useMarcarPago(id)
  const encerrar = useEncerrarLembretes(id)

  const [confirmarPago, setConfirmarPago] = useState(false)
  const [confirmarEncerrar, setConfirmarEncerrar] = useState(false)
  const [optoutIndisponivel, setOptoutIndisponivel] = useState(false)

  const noCiclo = aviso.status === 'programado'
  // O devedor informou que pagou: o aviso fica em revisão até quem convidou
  // confirmar o recebimento (informado_pago). 'pago' = já confirmado.
  const aguardandoConfirmacao = aviso.status === 'informado_pago'
  const jaConfirmado = aviso.status === 'pago'

  function aoMarcarPago() {
    marcarPago.mutate(undefined, { onSuccess: () => setConfirmarPago(false) })
  }

  function aoEncerrar() {
    encerrar.mutate(undefined, {
      onSuccess: (r) => {
        setConfirmarEncerrar(false)
        if (r.indisponivel) setOptoutIndisponivel(true)
      },
    })
  }

  return (
    <div className="animate-rise">
      <Link
        to="/meus"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-tinta-2 hover:text-salvia"
      >
        <ArrowLeft strokeWidth={1.75} className="size-4" />
        Meus combinados
      </Link>

      <PageHeader
        titulo={aviso.motivo}
        descricao="Combinado de pagamento"
        acoes={<StatusBadge status={aviso.status} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Card "aguardando confirmação": marco da Fase 5. */}
          {aguardandoConfirmacao && (
            <Card className="flex items-start gap-3 border-folha/30 bg-salvia-claro">
              <Hourglass strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-folha" />
              <div>
                <p className="font-medium text-folha">Você informou que pagou</p>
                <p className="mt-0.5 text-sm text-tinta-2">
                  Vamos avisar quem te convidou. Assim que a pessoa confirmar o recebimento, o
                  combinado fica concluído. Se ainda chegar algum lembrete neste meio-tempo,
                  pode desconsiderar.
                </p>
              </div>
            </Card>
          )}

          {/* Dados do combinado. */}
          <Card>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-tinta-2">Valor</dt>
                <dd className="mt-0.5">
                  <MoneyText centavos={aviso.valor_centavos} className="text-lg" />
                </dd>
              </div>
              <div>
                <dt className="text-tinta-2">Combinado para</dt>
                <dd className="mt-0.5 text-tinta">{dataPtBR(aviso.data_combinada)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-tinta-2">Sobre</dt>
                <dd className="mt-0.5 text-tinta">{aviso.motivo}</dd>
              </div>
              {aviso.aceito_em && (
                <div className="col-span-2">
                  <dt className="text-tinta-2">Você aceitou em</dt>
                  <dd className="mt-0.5 text-tinta">{dataHoraPtBR(aviso.aceito_em)}</dd>
                </div>
              )}
            </dl>

            {aviso.pix_chave && <ChavePix chave={aviso.pix_chave} />}
          </Card>

          {/* CycleTimeline: envios reais; degrada se o endpoint não existir. */}
          <Card>
            <h2 className="mb-4 text-lg text-salvia">Lembretes do combinado</h2>
            {envios.isLoading ? (
              <Skeleton className="h-24 w-full rounded-card" />
            ) : envios.data?.indisponivel ? (
              <Banner tom="info">
                O detalhamento dos lembretes ainda não está disponível por aqui. Os lembretes
                seguem o combinado de {dataPtBR(aviso.data_combinada)}.
              </Banner>
            ) : (envios.data?.itens.length ?? 0) === 0 ? (
              <p className="text-sm text-tinta-2">
                {aviso.status === 'aguardando_aceite'
                  ? 'Os lembretes começam assim que você confirmar o combinado.'
                  : 'Nenhum lembrete agendado para este combinado.'}
              </p>
            ) : (
              <CycleTimeline envios={envios.data!.itens} />
            )}
          </Card>

          {/* Histórico de eventos (in-app, risco nº 10). */}
          <Card>
            <h2 className="mb-4 flex items-center gap-2 text-lg text-salvia">
              <History strokeWidth={1.75} className="size-5" />
              Histórico
            </h2>
            {eventos.isLoading ? (
              <Skeleton className="h-20 w-full rounded-card" />
            ) : eventos.data?.indisponivel ? (
              <Banner tom="info">O histórico ainda não está disponível por este combinado.</Banner>
            ) : (eventos.data?.itens.length ?? 0) === 0 ? (
              <p className="text-sm text-tinta-2">Nenhum evento registrado ainda.</p>
            ) : (
              <ListaEventos eventos={eventos.data!.itens} />
            )}
          </Card>
        </div>

        {/* Coluna de ações. */}
        <div className="flex flex-col gap-3">
          <Card className="flex flex-col gap-3">
            <h2 className="text-lg text-salvia">O que você quer fazer?</h2>

            {noCiclo ? (
              <>
                <Button
                  onClick={() => setConfirmarPago(true)}
                  loading={marcarPago.isPending}
                  className="w-full"
                >
                  <CheckCircle2 strokeWidth={1.75} className="size-4" />
                  Já paguei
                </Button>
                <Button
                  variante="secondary"
                  onClick={() => setConfirmarEncerrar(true)}
                  loading={encerrar.isPending}
                  className="w-full"
                >
                  <BellOff strokeWidth={1.75} className="size-4" />
                  Encerrar lembretes
                </Button>
              </>
            ) : aguardandoConfirmacao ? (
              <p className="inline-flex items-start gap-2 text-sm text-revisao">
                <Hourglass strokeWidth={1.75} className="mt-0.5 size-4 shrink-0" />
                Você informou que pagou. Aguardando a confirmação de quem te convidou.
              </p>
            ) : jaConfirmado ? (
              <p className="inline-flex items-center gap-2 text-sm text-folha">
                <CheckCircle2 strokeWidth={1.75} className="size-4" />
                Combinado concluído. Obrigado!
              </p>
            ) : (
              <p className="text-sm text-tinta-2">
                Não há nenhuma ação disponível para este combinado.
              </p>
            )}

            {marcarPago.isError && (
              <Banner tom="erro">
                <span className="inline-flex items-center gap-1.5">
                  <AlertTriangle strokeWidth={1.75} className="size-4" />
                  Não foi possível registrar agora. Tente novamente.
                </span>
              </Banner>
            )}

            {(encerrar.isError || optoutIndisponivel) && (
              <Banner tom="info">
                Para encerrar os lembretes, use o botão "Encerrar" na mensagem do WhatsApp. Em
                breve isso também ficará disponível por aqui.
              </Banner>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        aberto={confirmarPago}
        titulo='Confirmar que você já pagou?'
        textoConfirmar="Sim, já paguei"
        textoCancelar="Voltar"
        carregando={marcarPago.isPending}
        onConfirmar={aoMarcarPago}
        onCancelar={() => setConfirmarPago(false)}
      >
        Vamos avisar quem te convidou para conferir e confirmar o recebimento. Se ainda chegar
        algum lembrete antes da confirmação, pode desconsiderar.
      </ConfirmDialog>

      <ConfirmDialog
        aberto={confirmarEncerrar}
        titulo="Encerrar os lembretes deste combinado?"
        textoConfirmar="Sim, encerrar"
        textoCancelar="Voltar"
        variante="destructive"
        carregando={encerrar.isPending}
        onConfirmar={aoEncerrar}
        onCancelar={() => setConfirmarEncerrar(false)}
      >
        Você deixa de receber os lembretes deste combinado pelo WhatsApp. Esta ação não pode ser
        desfeita.
      </ConfirmDialog>
    </div>
  )
}

function ChavePix({ chave }: { chave: string }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(chave)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      /* clipboard indisponível: a chave segue visível para cópia manual */
    }
  }

  return (
    <div className="mt-4 rounded-input border border-linha bg-papel-2 p-3">
      <p className="text-xs text-tinta-2">Chave Pix para pagar</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="min-w-0 break-all font-medium text-tinta">{chave}</span>
        <button
          type="button"
          onClick={copiar}
          aria-label="Copiar chave Pix"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-linha bg-cartao px-3 py-1.5 text-xs text-salvia hover:bg-salvia-claro"
        >
          {copiado ? (
            <>
              <Check strokeWidth={1.75} className="size-3.5" /> Copiado!
            </>
          ) : (
            <>
              <Copy strokeWidth={1.75} className="size-3.5" /> Copiar
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function ListaEventos({ eventos }: { eventos: EventoAviso[] }) {
  const ordenados = [...eventos].sort(
    (a, b) => a.criado_em.getTime() - b.criado_em.getTime(),
  )
  return (
    <ol className="flex flex-col gap-4">
      {ordenados.map((evento) => (
        <li key={evento.id} className="flex gap-3">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-salvia" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium text-tinta">{ROTULO_EVENTO[evento.tipo]}</p>
            <p className="text-xs text-tinta-2">
              {ROTULO_ATOR_DEVEDOR[evento.ator]} · {dataHoraPtBR(evento.criado_em)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
