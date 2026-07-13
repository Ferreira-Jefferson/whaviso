// Detalhe do aviso (/app/avisos/:id): dados + CycleTimeline + eventos + ações.
// - CycleTimeline derivada dos ENVIOS REAIS (etapa nunca calculada no cliente).
// - Linha do tempo de eventos = notificações in-app (eventos_aviso, risco nº 10).
// - direcao=pagar (sem ciclo/WhatsApp): só o registro, sem timeline.
// - Ações: confirmar/desmarcar recebimento (OTIMISTA, reversível);
//   cancelar (PESSIMISTA, ConfirmDialog). Invalidação cobre detalhe+lista+resumo.
// Linguagem das Regras de Ouro: só recebido/combinado/encerrar (ver linguagem.ts).
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  ArrowLeft,
  CheckCircle2,
  RotateCcw,
  XCircle,
  History,
  AlertTriangle,
  Hourglass,
  Pencil,
  Pause,
  Play,
  Send,
  Undo2,
  Users,
} from 'lucide-react'
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  CycleTimeline,
  DateInput,
  EmptyState,
  Field,
  Input,
  MoneyInput,
  MoneyText,
  PageHeader,
  PhoneInput,
  Skeleton,
  StatusBadge,
} from '@/shared/ui'
import {
  ROTULO_DIRECAO,
  ROTULO_EVENTO,
  dataPtBR,
  dataHoraPtBR,
  papelDoUsuario,
  rotuloAtor,
  telefone,
} from '@/shared/format'
import type { Aviso, EventoAviso, PapelAviso } from '@/shared/contracts'
import type { EditarAvisoBody } from '@/shared/contracts'
import type { AtivarAvisoBody, CriarAvisoResposta } from '@/shared/contracts'
import { ApiError } from '@/shared/api_client'
import { usePerfil } from '@/shared/auth'
import { useSemSaldo } from '@/shared/plano'
import {
  useAtivarAviso,
  useAviso,
  useAvisoEnvios,
  useAvisoEventos,
  useCombinadoEnvio,
  useCancelarAviso,
  useConfirmarRecebimento,
  useDesfazerEdicao,
  useDesmarcarRecebimento,
  useEditarAviso,
  useMarcarPagoAgenda,
  usePausarAviso,
  useReativarAviso,
  useReengajar,
  useRejeitarPagamento,
} from '../api'
import { AvisoCriado } from '../components/AvisoCriado'
import { ProgressoRecorrencia } from '../components/ProgressoRecorrencia'

export default function DetalheAvisoPage() {
  const { id = '' } = useParams()
  const aviso = useAviso(id)

  if (aviso.isLoading) {
    return (
      <div className="animate-rise flex flex-col gap-4">
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
    )
  }

  if (aviso.isError || !aviso.data) {
    return (
      <div className="animate-rise">
        <EmptyState
          titulo="Aviso não encontrado"
          descricao="Ele pode ter sido removido ou o link está incorreto."
          acao={
            <Link to="/app" className="text-sm font-medium text-salvia hover:underline">
              Voltar ao painel
            </Link>
          }
        />
      </div>
    )
  }

  return <DetalheConteudo id={id} aviso={aviso.data} />
}

function DetalheConteudo({ id, aviso }: { id: string; aviso: Aviso }) {
  const ehReceber = aviso.direcao === 'receber'
  const perfil = usePerfil()
  // H9.4: papel do USUÁRIO neste combinado (cobre o invertido), para rótulos relativos.
  const meuPapel: PapelAviso | null = papelDoUsuario(aviso, perfil?.id)
  // E11 H11.2/H11.4: agir nos combinados é UNIVERSAL; o único limite é o SALDO. Lemos o
  // saldo só para antecipar a CTA de recarga; a API barra de fato (saldo_insuficiente).
  const { semSaldo } = useSemSaldo()
  const envios = useAvisoEnvios(id, ehReceber)
  const eventos = useAvisoEventos(id)
  // E5/H5.0: o combinado é enviado de forma assíncrona (a api enfileira, o zap envia). Enquanto
  // aguarda aceite, mostramos o estado REAL do envio (enviando/enviado/nao_enviado), para nunca
  // afirmar "enviado" antes de sair. Sem polling: carrega ao abrir; ações invalidam a query.
  const emAceite = aviso.status === 'aguardando_aceite'
  const combinadoEnvio = useCombinadoEnvio(id, emAceite)

  const confirmar = useConfirmarRecebimento(id)
  const desmarcar = useDesmarcarRecebimento(id)
  const rejeitar = useRejeitarPagamento(id)
  const reengajar = useReengajar(id)
  const cancelar = useCancelarAviso(id)
  const editar = useEditarAviso(id)
  const desfazer = useDesfazerEdicao(id)
  const pausar = usePausarAviso(id)
  const reativar = useReativarAviso(id)
  const ativar = useAtivarAviso(id)
  const marcarPago = useMarcarPagoAgenda(id)
  const [confirmarCancelar, setConfirmarCancelar] = useState(false)
  const [editando, setEditando] = useState(false)
  const [ativando, setAtivando] = useState(false)
  // H9.5 / H8.1: ao confirmar pelo painel, a mensagem ao devedor sai em ~1min e dá para
  // reverter (reabrir) nesse intervalo. A AUTORIDADE é a api/zap (agendar_para); o front
  // só SINALIZA a janela e oferece o "desfazer". Marcamos a confirmação local recente
  // para mostrar a affordance; some quando o usuário sai/relê.
  const [confirmadoAgora, setConfirmadoAgora] = useState(false)
  // H4.3: resultado da ativação (combinado enviado): reusa a tela de "combinado enviado".
  const [resultadoAtivar, setResultadoAtivar] = useState<CriarAvisoResposta | null>(null)

  // H4.x: anotação de agenda (modo agenda). Ações: ativar / editar / descartar / pago.
  const ehAgenda = aviso.status === 'sem_aviso'
  const emRevisao = aviso.status === 'informado_pago'
  const emReaprovacao = aviso.status === 'aguardando_aprovacao_aviso_editado'
  const podeConfirmar = aviso.status === 'programado' || emRevisao
  const podeRejeitar = emRevisao
  const podeDesmarcar = aviso.status === 'pago'
  // H2.6: cancelável em qualquer fase viva.
  const VIVOS_CANCELAVEIS: Aviso['status'][] = [
    'aguardando_aceite',
    'sem_aviso',
    'programado',
    'pausado',
    'aguardando_aprovacao_aviso_editado',
    'informado_pago',
    'desregistrado',
  ]
  const podeCancelar = VIVOS_CANCELAVEIS.includes(aviso.status)
  // H2.5/H4.4: editar em qualquer fase viva (menos enquanto já há edição a aprovar). Na
  // agenda (sem_aviso) a edição é livre e vale nos dois fluxos.
  const podeEditar =
    (ehReceber || ehAgenda) && VIVOS_CANCELAVEIS.includes(aviso.status) && !emReaprovacao
  // Pós-aceite a edição exige nova aprovação do devedor.
  const editaExigeAprovacao = aviso.status !== 'aguardando_aceite' && aviso.status !== 'sem_aviso'
  // H2.7: pausar só de programado; reativar só de pausado.
  const podePausar = aviso.status === 'programado'
  const podeReativar = aviso.status === 'pausado'
  // H8.3: reengajamento manual disponível em `programado` no fluxo `receber` (o backend
  // gate o pós-ciclo + consome 1 crédito; defesa em profundidade, o front só solicita).
  // E11 H11.2: ativar/reengajar são universais; o que limita é o saldo (a API recusa com
  // saldo_insuficiente se faltar). O front mostra a CTA de recarga, sem esconder a ação.
  const podeReengajar = ehReceber && aviso.status === 'programado'
  const podeAtivar = ehAgenda

  // H4.3: tela de "combinado enviado" após ativar uma anotação da agenda.
  if (resultadoAtivar) {
    return <AvisoCriado resultado={resultadoAtivar} onNovo={() => setResultadoAtivar(null)} />
  }

  return (
    <div className="animate-rise">
      <Link
        to="/app"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-tinta-2 hover:text-salvia"
      >
        <ArrowLeft strokeWidth={1.75} className="size-4" />
        Voltar ao painel
      </Link>

      <PageHeader
        titulo={aviso.nome_devedor}
        descricao={`${ROTULO_DIRECAO[aviso.direcao]} · ${aviso.motivo}`}
        acoes={<StatusBadge status={aviso.status} papel={meuPapel} />}
      />

      {/* E15 H15.1: atalho para a visão da pessoa (todos os combinados do mesmo número).
          Só quando há telefone da outra ponta (agenda sem_aviso ainda não tem). */}
      {(aviso.telefone_devedor || aviso.telefone_cobrador) && (
        <Link
          to={`/app/pessoa/${aviso.id}`}
          className="-mt-2 mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-salvia hover:underline"
        >
          <Users strokeWidth={1.75} className="size-4" />
          Ver tudo com {meuPapel === 'devedor' ? (aviso.nome_cobrador ?? aviso.nome_devedor) : aviso.nome_devedor}
        </Link>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Coluna principal: dados + timeline + eventos */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* E6 H6.10: progresso "k de N" de um combinado recorrente. Só aparece quando
              a api manda ocorrencias_total; o front não recalcula nada. */}
          <ProgressoRecorrencia aviso={aviso} meuPapel={meuPapel} />

          {/* H4.x: anotação de agenda (nada enviado ainda). */}
          {ehAgenda && (
            <Card className="flex items-start gap-3 border-linha bg-areia/40">
              <Hourglass strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-tinta-2" />
              <div>
                <p className="font-medium text-tinta">Só na agenda, nada enviado</p>
                <p className="mt-0.5 text-sm text-tinta-2">
                  Este combinado está só na sua agenda: ninguém recebeu nada. Edite à
                  vontade, ative para enviar o combinado, marque como recebido se já fechou,
                  ou descarte.
                </p>
              </div>
            </Card>
          )}

          {/* E5/H5.0: estado REAL do envio do combinado (enviando/enviado/nao_enviado).
              O envio é assíncrono; nunca afirmar "enviado" antes de o zap enviar de fato. */}
          {emAceite && combinadoEnvio.data && (
            <>
              {combinadoEnvio.data.estado === 'enviando' && (
                <Card className="flex items-start gap-3 border-linha bg-areia/40">
                  <Send strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-tinta-2" />
                  <div>
                    <p className="font-medium text-tinta">Enviando o combinado</p>
                    <p className="mt-0.5 text-sm text-tinta-2">
                      O Whaviso está enviando o combinado para o WhatsApp da pessoa. Isso pode
                      levar alguns instantes. Assim que ela responder, o combinado entra no ciclo.
                    </p>
                  </div>
                </Card>
              )}
              {combinadoEnvio.data.estado === 'enviado' && (
                <Card className="flex items-start gap-3 border-folha/30 bg-salvia-claro">
                  <CheckCircle2 strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-folha" />
                  <div>
                    <p className="font-medium text-folha">Combinado enviado</p>
                    <p className="mt-0.5 text-sm text-tinta-2">
                      {combinadoEnvio.data.enviado_em
                        ? `Enviado pelo WhatsApp em ${dataHoraPtBR(combinadoEnvio.data.enviado_em)}. É só aguardar a pessoa confirmar.`
                        : 'Enviado pelo WhatsApp. É só aguardar a pessoa confirmar.'}
                    </p>
                  </div>
                </Card>
              )}
              {combinadoEnvio.data.estado === 'nao_enviado' && (
                <Card className="flex items-start gap-3 border-ambar/30 bg-ambar-claro">
                  <AlertTriangle strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-ambar" />
                  <div>
                    <p className="font-medium text-ambar">Combinado ainda não enviado</p>
                    <p className="mt-0.5 text-sm text-tinta-2">
                      Ainda não foi possível enviar o combinado pelo WhatsApp. O Whaviso vai
                      tentar de novo automaticamente.
                    </p>
                  </div>
                </Card>
              )}
            </>
          )}

          {/* Pessoa informou pagamento: aguardando o cobrador conferir e confirmar. */}
          {emRevisao && (
            <Card className="flex items-start gap-3 border-revisao/30 bg-revisao-claro">
              <Hourglass strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-revisao" />
              <div>
                <p className="font-medium text-revisao">A pessoa informou que pagou</p>
                <p className="mt-0.5 text-sm text-tinta-2">
                  Confira se o valor entrou e confirme o recebimento. Se ainda não localizou o
                  pagamento, marque "Ainda não recebi" e o aviso volta ao ciclo.
                </p>
              </div>
            </Card>
          )}

          {/* H2.5: edição aguardando a aprovação do devedor; lembretes pausados. */}
          {emReaprovacao && (
            <Card className="flex items-start gap-3 border-ambar/30 bg-ambar-claro">
              <Hourglass strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-ambar" />
              <div>
                <p className="font-medium text-ambar">Edição aguardando aprovação</p>
                <p className="mt-0.5 text-sm text-tinta-2">
                  A pessoa precisa aprovar a alteração. Enquanto isso, os lembretes deste
                  combinado ficam pausados. Você pode desfazer a edição e voltar às
                  condições anteriores.
                </p>
              </div>
            </Card>
          )}

          {/* H9.5/H8.1: janela de ~1min após confirmar. A mensagem ao devedor ainda não
              saiu; reabrir agora a cancela (a pessoa não recebe nada). Sem regra no front. */}
          {confirmadoAgora && aviso.status === 'pago' && (
            <Card className="flex items-start gap-3 border-folha/30 bg-salvia-claro">
              <Hourglass strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-folha" />
              <div className="flex-1">
                <p className="font-medium text-folha">Recebimento confirmado</p>
                <p className="mt-0.5 text-sm text-tinta-2">
                  O aviso de encerramento à pessoa sai em cerca de 1 minuto. Se confirmou sem
                  querer, você ainda dá tempo de reabrir: a pessoa não recebe nada.
                </p>
                <Button
                  variante="secondary"
                  onClick={() =>
                    desmarcar.mutate(undefined, { onSuccess: () => setConfirmadoAgora(false) })
                  }
                  loading={desmarcar.isPending}
                  className="mt-3"
                >
                  <Undo2 strokeWidth={1.75} className="size-4" />
                  Reabrir combinado
                </Button>
              </div>
            </Card>
          )}

          <Card>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-tinta-2">Valor</dt>
                <dd className="mt-0.5">
                  <MoneyText centavos={aviso.valor_centavos} className="text-lg" />
                </dd>
              </div>
              <div>
                <dt className="text-tinta-2">Data combinada</dt>
                <dd className="mt-0.5 text-tinta">{dataPtBR(aviso.data_combinada)}</dd>
              </div>
              <div>
                <dt className="text-tinta-2">Direção</dt>
                <dd className="mt-0.5 text-tinta">{ROTULO_DIRECAO[aviso.direcao]}</dd>
              </div>
              {ehReceber && (
                <div>
                  <dt className="text-tinta-2">Telefone</dt>
                  <dd className="mt-0.5 text-tinta">{telefone(aviso.telefone_devedor)}</dd>
                </div>
              )}
              {aviso.pix_chave && (
                <div className="col-span-2">
                  <dt className="text-tinta-2">Chave Pix</dt>
                  <dd className="mt-0.5 break-all text-tinta">{aviso.pix_chave}</dd>
                </div>
              )}
              {aviso.pix_titular && (
                <div>
                  <dt className="text-tinta-2">Titular da chave</dt>
                  <dd className="mt-0.5 text-tinta">{aviso.pix_titular}</dd>
                </div>
              )}
              {aviso.pix_banco && (
                <div>
                  <dt className="text-tinta-2">Banco da chave</dt>
                  <dd className="mt-0.5 text-tinta">{aviso.pix_banco}</dd>
                </div>
              )}
              {aviso.aceito_em && (
                <div className="col-span-2">
                  <dt className="text-tinta-2">Aceito em</dt>
                  <dd className="mt-0.5 text-tinta">{dataHoraPtBR(aviso.aceito_em)}</dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Fase A: composição do pedido (itens). Dado INTERNO do dono: só aparece aqui,
              nunca para a outra pessoa. Só renderiza quando o combinado tem itens. */}
          {aviso.itens && aviso.itens.length > 0 && (
            <Card>
              <h2 className="mb-1 text-lg text-salvia">Itens do pedido</h2>
              <p className="mb-4 text-sm text-tinta-2">
                O que foi combinado, só para o seu controle. A outra pessoa não vê esta lista.
              </p>
              <ul className="flex flex-col divide-y divide-linha">
                {aviso.itens.map((item, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-tinta">
                      {item.qtd > 1 && <span className="text-tinta-2">{item.qtd}× </span>}
                      {item.descricao}
                    </span>
                    <MoneyText centavos={item.qtd * item.valor_unit_centavos} className="shrink-0 tabular" />
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between border-t border-linha pt-3 text-sm">
                <span className="text-tinta-2">Total dos itens</span>
                <MoneyText
                  centavos={aviso.itens.reduce((s, it) => s + it.qtd * it.valor_unit_centavos, 0)}
                  className="font-medium tabular"
                />
              </div>
            </Card>
          )}

          {/* CycleTimeline: só para "a receber" (pagar não tem ciclo/WhatsApp). */}
          {ehReceber && (
            <Card>
              <h2 className="mb-4 text-lg text-salvia">Ciclo de lembretes</h2>
              {envios.isLoading ? (
                <Skeleton className="h-24 w-full rounded-card" />
              ) : envios.data?.indisponivel ? (
                <Banner tom="info">
                  O detalhamento do ciclo ainda não está disponível por este aviso. Os
                  lembretes seguem o combinado de {dataPtBR(aviso.data_combinada)}.
                </Banner>
              ) : (envios.data?.itens.length ?? 0) === 0 ? (
                <p className="text-sm text-tinta-2">
                  {aviso.status === 'aguardando_aceite'
                    ? 'O ciclo começa assim que a pessoa confirmar o combinado.'
                    : 'Nenhum lembrete agendado para este aviso.'}
                </p>
              ) : (
                <CycleTimeline envios={envios.data!.itens} />
              )}
            </Card>
          )}

          {/* Linha do tempo de eventos (notificações in-app, risco nº 10). */}
          <Card>
            <h2 className="mb-4 flex items-center gap-2 text-lg text-salvia">
              <History strokeWidth={1.75} className="size-5" />
              Histórico
            </h2>
            {eventos.isLoading ? (
              <Skeleton className="h-20 w-full rounded-card" />
            ) : eventos.data?.indisponivel ? (
              <Banner tom="info">
                O histórico de eventos ainda não está disponível por este aviso.
              </Banner>
            ) : (eventos.data?.itens.length ?? 0) === 0 ? (
              <p className="text-sm text-tinta-2">Nenhum evento registrado ainda.</p>
            ) : (
              <ListaEventos eventos={eventos.data!.itens} meuPapel={meuPapel} />
            )}
          </Card>
        </div>

        {/* Coluna lateral: ações */}
        <div className="flex flex-col gap-3">
          <Card className="flex flex-col gap-3">
            <h2 className="text-lg text-salvia">Ações</h2>

            {/* H4.3: ativar a anotação (envia o combinado). Exige plano (envia). */}
            {podeAtivar && (
              <Button onClick={() => setAtivando(true)} className="w-full">
                <Send strokeWidth={1.75} className="size-4" />
                Ativar e enviar combinado
              </Button>
            )}

            {/* E11 H11.9: sem saldo, antecipa a CTA de recarga (a API ainda barra na ativação). */}
            {ehAgenda && semSaldo && (
              <Banner tom="info">
                Você está sem saldo de envios. Para ativar e enviar o combinado,{' '}
                <Link to="/app/creditos" className="font-medium underline">
                  recarregue créditos
                </Link>
                .
              </Banner>
            )}

            {/* H4.5: marcar pago manual (fecha sem nunca enviar). */}
            {ehAgenda && (
              <Button
                variante="secondary"
                onClick={() => marcarPago.mutate()}
                loading={marcarPago.isPending}
                className="w-full"
              >
                <CheckCircle2 strokeWidth={1.75} className="size-4" />
                Marcar como recebido
              </Button>
            )}

            {podeConfirmar && (
              <Button
                onClick={() =>
                  confirmar.mutate(undefined, { onSuccess: () => setConfirmadoAgora(true) })
                }
                loading={confirmar.isPending}
                className="w-full"
              >
                <CheckCircle2 strokeWidth={1.75} className="size-4" />
                Confirmar recebimento
              </Button>
            )}

            {podeRejeitar && (
              <Button
                variante="secondary"
                onClick={() => rejeitar.mutate()}
                loading={rejeitar.isPending}
                className="w-full"
              >
                <RotateCcw strokeWidth={1.75} className="size-4" />
                Ainda não recebi
              </Button>
            )}

            {podeDesmarcar && (
              <Button
                variante="secondary"
                onClick={() => desmarcar.mutate()}
                loading={desmarcar.isPending}
                className="w-full"
              >
                <RotateCcw strokeWidth={1.75} className="size-4" />
                Reabrir combinado
              </Button>
            )}

            {podeReengajar && (
              <Button
                variante="secondary"
                onClick={() => reengajar.mutate()}
                loading={reengajar.isPending}
                className="w-full"
              >
                <Play strokeWidth={1.75} className="size-4" />
                Reengajar (avisar que não localizei)
              </Button>
            )}

            {podePausar && (
              <Button
                variante="secondary"
                onClick={() => pausar.mutate()}
                loading={pausar.isPending}
                className="w-full"
              >
                <Pause strokeWidth={1.75} className="size-4" />
                Pausar lembretes
              </Button>
            )}

            {podeReativar && (
              <Button
                onClick={() => reativar.mutate()}
                loading={reativar.isPending}
                className="w-full"
              >
                <Play strokeWidth={1.75} className="size-4" />
                Reativar lembretes
              </Button>
            )}

            {podeEditar && (
              <Button
                variante="secondary"
                onClick={() => setEditando(true)}
                className="w-full"
              >
                <Pencil strokeWidth={1.75} className="size-4" />
                Editar combinado
              </Button>
            )}

            {emReaprovacao && (
              <Button
                variante="secondary"
                onClick={() => desfazer.mutate()}
                loading={desfazer.isPending}
                className="w-full"
              >
                <Undo2 strokeWidth={1.75} className="size-4" />
                Desfazer edição
              </Button>
            )}

            {podeCancelar && (
              <Button
                variante="destructive"
                onClick={() => setConfirmarCancelar(true)}
                className="w-full"
              >
                <XCircle strokeWidth={1.75} className="size-4" />
                {ehAgenda ? 'Descartar' : 'Cancelar combinado'}
              </Button>
            )}

            {!ehAgenda && !podeConfirmar && !podeRejeitar && !podeDesmarcar && !podeCancelar &&
              !podePausar && !podeReativar && !podeReengajar && !podeEditar && !emReaprovacao && (
              <p className="text-sm text-tinta-2">Nenhuma ação disponível para este estado.</p>
            )}

            {(confirmar.isError || rejeitar.isError || desmarcar.isError || cancelar.isError ||
              editar.isError || desfazer.isError || pausar.isError || reativar.isError ||
              reengajar.isError || marcarPago.isError) && (
              <Banner tom="erro">
                <span className="inline-flex items-center gap-1.5">
                  <AlertTriangle strokeWidth={1.75} className="size-4" />
                  {(editar.error instanceof Error && editar.error.message) ||
                    (marcarPago.error instanceof Error && marcarPago.error.message) ||
                    (reengajar.error instanceof Error && reengajar.error.message) ||
                    'Não foi possível concluir. Tente novamente.'}
                </span>
              </Banner>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        aberto={confirmarCancelar}
        titulo={ehAgenda ? 'Descartar este combinado?' : 'Cancelar este combinado?'}
        textoConfirmar={ehAgenda ? 'Sim, descartar' : 'Sim, cancelar'}
        textoCancelar="Voltar"
        variante="destructive"
        carregando={cancelar.isPending}
        onConfirmar={() =>
          cancelar.mutate(undefined, { onSuccess: () => setConfirmarCancelar(false) })
        }
        onCancelar={() => setConfirmarCancelar(false)}
      >
        {ehAgenda
          ? 'Como nada foi enviado, isso encerra o combinado sem avisar ninguém. Esta ação não pode ser desfeita.'
          : 'Os lembretes ainda não enviados serão cancelados. Esta ação não pode ser desfeita.'}
      </ConfirmDialog>

      {ativando && (
        <AtivarModal
          aviso={aviso}
          ativando={ativar.isPending}
          erro={ativar.error instanceof Error ? ativar.error.message : null}
          ehLimite={ativar.error instanceof ApiError && ativar.error.isLimiteDeSaldo}
          onAtivar={(body) =>
            ativar.mutate(body, {
              onSuccess: (r) => {
                setAtivando(false)
                setResultadoAtivar(r)
              },
            })
          }
          onFechar={() => setAtivando(false)}
        />
      )}

      {editando && (
        <EditarModal
          aviso={aviso}
          exigeAprovacao={editaExigeAprovacao}
          salvando={editar.isPending}
          onSalvar={(body) =>
            editar.mutate(body, { onSuccess: () => setEditando(false) })
          }
          onFechar={() => setEditando(false)}
        />
      )}
    </div>
  )
}

// H2.5: modal de edição (reusa Inputs simples). Para combinado JÁ aceito, mostra o
// aviso de confirmação com o texto exato da história antes de salvar (a alteração vai
// para aprovação do devedor e pausa os lembretes).
function EditarModal({
  aviso,
  exigeAprovacao,
  salvando,
  onSalvar,
  onFechar,
}: {
  aviso: Aviso
  exigeAprovacao: boolean
  salvando: boolean
  onSalvar: (body: EditarAvisoBody) => void
  onFechar: () => void
}) {
  const [nome, setNome] = useState(aviso.nome_devedor)
  const [motivo, setMotivo] = useState(aviso.motivo)
  const [valor, setValor] = useState<number | null>(aviso.valor_centavos)
  const [data, setData] = useState(aviso.data_combinada)
  const [pix, setPix] = useState(aviso.pix_chave ?? '')
  const [titular, setTitular] = useState(aviso.pix_titular ?? '')
  const [banco, setBanco] = useState(aviso.pix_banco ?? '')
  const [confirmando, setConfirmando] = useState(false)

  // Monta o corpo só com os campos que MUDARAM (edição parcial).
  function montar(): EditarAvisoBody {
    const body: EditarAvisoBody = {}
    if (nome.trim() && nome.trim() !== aviso.nome_devedor) body.nome_devedor = nome.trim()
    if (motivo.trim() && motivo.trim() !== aviso.motivo) body.motivo = motivo.trim()
    if (valor != null && valor !== aviso.valor_centavos) body.valor_centavos = valor
    if (data && data !== aviso.data_combinada) body.data_combinada = data
    if (pix.trim() && pix.trim() !== (aviso.pix_chave ?? '')) body.pix_chave = pix.trim()
    if (titular.trim() && titular.trim() !== (aviso.pix_titular ?? '')) body.pix_titular = titular.trim()
    if (banco.trim() && banco.trim() !== (aviso.pix_banco ?? '')) body.pix_banco = banco.trim()
    return body
  }

  const body = montar()
  const semMudanca = Object.keys(body).length === 0

  function aoSalvar() {
    if (semMudanca) return
    if (exigeAprovacao) {
      setConfirmando(true)
      return
    }
    onSalvar(body)
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-tinta/40 p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Editar combinado"
      >
        <Card className="flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-y-auto">
          <h2 className="text-lg text-salvia">Editar combinado</h2>
          <Field label="Nome de quem vai pagar">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </Field>
          <Field label="Sobre o quê">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor">
              <MoneyInput value={valor} onChange={setValor} />
            </Field>
            <Field label="Data combinada">
              <DateInput value={data} onChange={(e) => setData(e.target.value)} />
            </Field>
          </div>
          <Field label="Chave Pix">
            <Input value={pix} onChange={(e) => setPix(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Titular da chave">
              <Input value={titular} onChange={(e) => setTitular(e.target.value)} />
            </Field>
            <Field label="Banco da chave">
              <Input value={banco} onChange={(e) => setBanco(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variante="secondary" onClick={onFechar}>
              Cancelar
            </Button>
            <Button onClick={aoSalvar} loading={salvando} disabled={semMudanca}>
              Salvar
            </Button>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        aberto={confirmando}
        titulo="Salvar alteração?"
        textoConfirmar="Sim, continuar"
        textoCancelar="Voltar"
        carregando={salvando}
        onConfirmar={() => onSalvar(body)}
        onCancelar={() => setConfirmando(false)}
      >
        {`O Aviso editado precisa ser aprovado por ${aviso.nome_devedor}. Enquanto isso, as notificações deste combinado ficam pausadas. Deseja continuar?`}
      </ConfirmDialog>
    </>
  )
}

// H4.3: modal de ativação. Coleta os dados faltantes da outra ponta (telefone/Pix) e,
// se o plano não permite ativar (free/limite), mostra a CTA de plano sem erro feio.
function AtivarModal({
  aviso,
  ativando,
  erro,
  ehLimite,
  onAtivar,
  onFechar,
}: {
  aviso: Aviso
  ativando: boolean
  erro: string | null
  ehLimite: boolean
  onAtivar: (body: AtivarAvisoBody) => void
  onFechar: () => void
}) {
  const ehReceber = aviso.direcao === 'receber'
  // Pré-preenche com o que já existe; o usuário completa o que falta.
  const [telDevedor, setTelDevedor] = useState<string | null>(aviso.telefone_devedor)
  const [nomeCobrador, setNomeCobrador] = useState(aviso.nome_cobrador ?? '')
  const [telCobrador, setTelCobrador] = useState<string | null>(aviso.telefone_cobrador)
  const [pix, setPix] = useState(aviso.pix_chave ?? '')
  const [titular, setTitular] = useState(aviso.pix_titular ?? '')
  const [banco, setBanco] = useState(aviso.pix_banco ?? '')

  function montar(): AtivarAvisoBody {
    const body: AtivarAvisoBody = {}
    if (ehReceber) {
      if (telDevedor) body.telefone_devedor = telDevedor
      if (titular.trim()) body.pix_titular = titular.trim()
      if (banco.trim()) body.pix_banco = banco.trim()
    } else {
      if (nomeCobrador.trim()) body.nome_cobrador = nomeCobrador.trim()
      if (telCobrador) body.telefone_cobrador = telCobrador
    }
    if (pix.trim()) body.pix_chave = pix.trim()
    return body
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-tinta/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Ativar combinado"
    >
      <Card className="flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-y-auto">
        <h2 className="text-lg text-salvia">Ativar e enviar combinado</h2>
        <p className="text-sm text-tinta-2">
          Confira os dados de contato e a chave Pix. Ao ativar, enviamos o combinado para a
          pessoa confirmar.
        </p>

        {ehLimite ? (
          <Banner tom="info">
            {erro}{' '}
            <Link to="/app/creditos" className="font-medium underline">
              Recarregar créditos
            </Link>
          </Banner>
        ) : (
          erro && <Banner tom="erro">{erro}</Banner>
        )}

        {ehReceber ? (
          <>
            <Field label="WhatsApp de quem vai pagar">
              <PhoneInput value={telDevedor} onChange={setTelDevedor} />
            </Field>
            <Field label="Chave Pix">
              <Input value={pix} onChange={(e) => setPix(e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Titular da chave">
                <Input value={titular} onChange={(e) => setTitular(e.target.value)} />
              </Field>
              <Field label="Banco da chave">
                <Input value={banco} onChange={(e) => setBanco(e.target.value)} />
              </Field>
            </div>
          </>
        ) : (
          <>
            <Field label="Nome de quem vai receber">
              <Input value={nomeCobrador} onChange={(e) => setNomeCobrador(e.target.value)} />
            </Field>
            <Field label="WhatsApp de quem vai receber">
              <PhoneInput value={telCobrador} onChange={setTelCobrador} />
            </Field>
            <Field label="Chave Pix de quem vai receber">
              <Input value={pix} onChange={(e) => setPix(e.target.value)} />
            </Field>
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variante="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={() => onAtivar(montar())} loading={ativando}>
            Ativar
          </Button>
        </div>
      </Card>
    </div>
  )
}

function ListaEventos({
  eventos,
  meuPapel,
}: {
  eventos: EventoAviso[]
  meuPapel: PapelAviso | null
}) {
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
              {/* H9.4: ator RELATIVO ao papel do usuário (distingue informado-pela-pessoa
                  de confirmado-por-você nos dois lados). */}
              {rotuloAtor(evento.ator, meuPapel)} · {dataHoraPtBR(evento.criado_em)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
