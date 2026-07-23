// Detalhe do aviso (/app/avisos/:id): dados + CycleTimeline + eventos + ações.
// - CycleTimeline derivada dos ENVIOS REAIS (etapa nunca calculada no cliente).
// - Linha do tempo de eventos = notificações in-app (eventos_aviso, risco nº 10).
// - direcao=pagar (sem ciclo/WhatsApp): só o registro, sem timeline.
// - Ações: confirmar/desmarcar recebimento (OTIMISTA, reversível);
//   cancelar (PESSIMISTA, ConfirmDialog). Invalidação cobre detalhe+lista+resumo.
// Linguagem das Regras de Ouro: só recebido/combinado/encerrar (ver linguagem.ts).
import { useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
  ShieldAlert,
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
  IconePendencia,
  Input,
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
import type { Aviso, AvisoReporte, EventoAviso, ItemPedido, PapelAviso } from '@/shared/contracts'
import type { EditarAvisoBody } from '@/shared/contracts'
import type { AtivarAvisoBody, CriarAvisoResposta } from '@/shared/contracts'
import { somaItensCentavos, STATUS_AGUARDANDO_APROVACAO_DADO_INCORRETO } from '@/shared/contracts'
import { ItensPedido } from '../components/ItensPedido'
import { ApiError } from '@/shared/api_client'
import { usePerfil } from '@/shared/auth'
import { useSemSaldo } from '@/shared/plano'
import {
  useAprovarDadoIncorreto,
  useAtivarAviso,
  useAviso,
  useAvisoCodigo,
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
  useRecusarDadoIncorreto,
  useRejeitarPagamento,
} from '../api'
import { AvisoCriado } from '../components/AvisoCriado'
import { ProgressoRecorrencia } from '../components/ProgressoRecorrencia'

// Item 1 (feedback 2026-07-22): primeiro erro REAL entre as mutações da tela, de forma
// GENÉRICA (não uma lista fixa de nomes de botão): cobre Reengajar e qualquer outra
// ação que hoje engula um erro de saldo. Quando é `saldo_insuficiente`/`agenda_cheia`
// (ApiError.isLimiteDeSaldo), a tela mostra sempre o MESMO banner + link para
// /app/creditos usado hoje só no Ativar (ver AtivarModal), em vez do erro cru.
function primeiroErro(mutacoes: ReadonlyArray<{ isError: boolean; error: unknown }>): Error | null {
  for (const m of mutacoes) {
    if (m.isError && m.error instanceof Error) return m.error
  }
  return null
}

// Item 8 (feedback 2026-07-22): pendência do aviso, decidida no CLIENTE a partir do
// status, para destacar visualmente que o combinado precisa de uma ação do cobrador.
type PendenciaAviso =
  | 'confirmar_pagamento'
  | 'aprovar_dado_incorreto'
  | 'aprovar_edicao'
  | 'sem_saldo_ativar'
  | null

function tooltipDaPendencia(pendencia: PendenciaAviso): string {
  switch (pendencia) {
    case 'confirmar_pagamento':
      return 'O devedor informou que pagou. Confirme ou rejeite o pagamento.'
    case 'aprovar_dado_incorreto':
      return 'O devedor reportou um dado incorreto no combinado. Aprove ou recuse a correção.'
    case 'aprovar_edicao':
      return 'Você editou o combinado. Aguardando aprovação do devedor para retomar os lembretes.'
    case 'sem_saldo_ativar':
      return 'Sem créditos suficientes para ativar este combinado.'
    case null:
      return ''
  }
}

// Item 7: envolve um campo do EditarModal com destaque visual (cor) quando ele veio de
// uma aprovação de reporte de dado incorreto, para o cobrador ver o que mudou.
function CampoDestacado({ ativo, children }: { ativo: boolean; children: ReactNode }) {
  if (!ativo) return <>{children}</>
  return (
    <div className="-m-2 rounded-card border border-ambar/40 bg-ambar-claro/50 p-2">
      {children}
    </div>
  )
}

function pendenciaDoAviso(status: Aviso['status'], ehAgenda: boolean, semSaldo: boolean): PendenciaAviso {
  if (status === 'informado_pago') return 'confirmar_pagamento'
  if (status === STATUS_AGUARDANDO_APROVACAO_DADO_INCORRETO) return 'aprovar_dado_incorreto'
  if (status === 'aguardando_aprovacao_aviso_editado') return 'aprovar_edicao'
  if (ehAgenda && semSaldo) return 'sem_saldo_ativar'
  return null
}

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
  // Item 7: aprovar reabre a edição pré-preenchida (guardamos o reporte devolvido);
  // recusar só volta o combinado a `programado`.
  const aprovarDadoIncorreto = useAprovarDadoIncorreto(id)
  const recusarDadoIncorreto = useRecusarDadoIncorreto(id)
  // Item 21: código curto do combinado (rota dedicada; degrada para null se ainda não
  // existir no backend em execução, ex.: migration 0093 pendente de aplicar no cloud).
  const codigo = useAvisoCodigo(id)
  const [confirmarCancelar, setConfirmarCancelar] = useState(false)
  const [editando, setEditando] = useState(false)
  const [reporteParaEditar, setReporteParaEditar] = useState<AvisoReporte | null>(null)
  const [confirmarRecusarReporte, setConfirmarRecusarReporte] = useState(false)
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
  const emAprovacaoDadoIncorreto = aviso.status === STATUS_AGUARDANDO_APROVACAO_DADO_INCORRETO
  // Item 8: pendência a destacar (badge "Precisa de você" no cabeçalho).
  const pendencia = pendenciaDoAviso(aviso.status, ehAgenda, semSaldo)
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
    STATUS_AGUARDANDO_APROVACAO_DADO_INCORRETO,
    'informado_pago',
    'desregistrado',
  ]
  const podeCancelar = VIVOS_CANCELAVEIS.includes(aviso.status)
  // H2.5/H4.4: editar em qualquer fase viva (menos enquanto já há edição a aprovar OU um
  // dado reportado como incorreto a aprovar/recusar, item 7). Na agenda (sem_aviso) a
  // edição é livre e vale nos dois fluxos.
  const podeEditar =
    (ehReceber || ehAgenda) &&
    VIVOS_CANCELAVEIS.includes(aviso.status) &&
    !emReaprovacao &&
    !emAprovacaoDadoIncorreto
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
        acoes={
          <div className="flex items-center gap-2">
            {/* Item 8: pendência do aviso (precisa de uma ação sua). */}
            {pendencia && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-ambar-claro px-2 py-1 text-xs font-medium text-ambar">
                <IconePendencia tipo="aviso" tooltip={tooltipDaPendencia(pendencia)} className="size-3" />
                Precisa de você
              </span>
            )}
            <StatusBadge status={aviso.status} papel={meuPapel} />
          </div>
        }
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

          {/* Item 7: a pessoa reportou um dado do combinado como incorreto (valor, data ou
              nome/motivo); aguarda o cobrador aprovar (reabre a edição pré-preenchida com
              o que a pessoa informou como correto) ou recusar (mantém como estava). */}
          {emAprovacaoDadoIncorreto && (
            <Card className="flex items-start gap-3 border-ambar/30 bg-ambar-claro">
              <ShieldAlert strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-ambar" />
              <div className="flex-1">
                <p className="font-medium text-ambar">A pessoa reportou um dado incorreto</p>
                <p className="mt-0.5 text-sm text-tinta-2">
                  Enquanto isso, os lembretes deste combinado ficam pausados. Ao aprovar, você
                  revisa a correção antes de confirmar; ao recusar, o combinado segue como está.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    onClick={() =>
                      aprovarDadoIncorreto.mutate(undefined, {
                        onSuccess: (r) => setReporteParaEditar(r.reporte),
                      })
                    }
                    loading={aprovarDadoIncorreto.isPending}
                  >
                    <CheckCircle2 strokeWidth={1.75} className="size-4" />
                    Revisar e aprovar
                  </Button>
                  <Button
                    variante="secondary"
                    onClick={() => setConfirmarRecusarReporte(true)}
                    loading={recusarDadoIncorreto.isPending}
                  >
                    <XCircle strokeWidth={1.75} className="size-4" />
                    Recusar
                  </Button>
                </div>
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
              {/* Item 21: código curto do combinado (rota dedicada; degrada em silêncio
                  se ainda não existir no backend em execução). */}
              {codigo.data && (
                <div>
                  <dt className="text-tinta-2">Código do combinado</dt>
                  <dd className="mt-0.5 font-medium tracking-wide text-tinta">{codigo.data}</dd>
                </div>
              )}
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
              !podePausar && !podeReativar && !podeReengajar && !podeEditar && !emReaprovacao &&
              !emAprovacaoDadoIncorreto && (
              <p className="text-sm text-tinta-2">Nenhuma ação disponível para este estado.</p>
            )}

            {/* Item 1 (feedback 2026-07-22): primeiro erro REAL de QUALQUER mutação da
                tela (helper genérico, sem lista fixa de botões: cobre Reengajar e
                qualquer outra ação futura). Erro de saldo insuficiente sempre mostra o
                mesmo banner + link para /app/creditos usado hoje só no Ativar; os demais
                erros seguem no banner simples de sempre. `ativar` fica de fora (já tem o
                próprio tratamento dedicado dentro do AtivarModal). */}
            {(() => {
              const erro = primeiroErro([
                confirmar, rejeitar, desmarcar, cancelar, editar, desfazer, pausar,
                reativar, reengajar, marcarPago, aprovarDadoIncorreto, recusarDadoIncorreto,
              ])
              if (!erro) return null
              const ehSaldo = erro instanceof ApiError && erro.isLimiteDeSaldo
              if (ehSaldo) {
                return (
                  <Banner tom="info">
                    {erro.message}{' '}
                    <Link to="/app/creditos" className="font-medium underline">
                      Recarregar créditos
                    </Link>
                  </Banner>
                )
              }
              return (
                <Banner tom="erro">
                  <span className="inline-flex items-center gap-1.5">
                    <AlertTriangle strokeWidth={1.75} className="size-4" />
                    {erro.message || 'Não foi possível concluir. Tente novamente.'}
                  </span>
                </Banner>
              )
            })()}
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

      {/* Item 7: aprovar reabre a edição pré-preenchida com o que a pessoa informou como
          correto, com o(s) campo(s) alterado(s) destacado(s), para o cobrador revisar
          antes de confirmar/enviar (a edição em si segue o caminho normal do PATCH,
          incluindo reaprovação do devedor se o combinado já foi aceito). */}
      {reporteParaEditar && (
        <EditarModal
          aviso={aviso}
          exigeAprovacao={editaExigeAprovacao}
          salvando={editar.isPending}
          valoresIniciais={valoresDoReporte(reporteParaEditar, aviso)}
          destaques={destaquesDoReporte(reporteParaEditar.campo)}
          onSalvar={(body) =>
            editar.mutate(body, { onSuccess: () => setReporteParaEditar(null) })
          }
          onFechar={() => setReporteParaEditar(null)}
        />
      )}

      <ConfirmDialog
        aberto={confirmarRecusarReporte}
        titulo="Recusar o dado reportado?"
        textoConfirmar="Sim, recusar"
        textoCancelar="Voltar"
        carregando={recusarDadoIncorreto.isPending}
        onConfirmar={() =>
          recusarDadoIncorreto.mutate(undefined, {
            onSuccess: () => setConfirmarRecusarReporte(false),
          })
        }
        onCancelar={() => setConfirmarRecusarReporte(false)}
      >
        O combinado segue com os dados atuais, sem nenhuma alteração. Os lembretes voltam a
        sair normalmente.
      </ConfirmDialog>
    </div>
  )
}

/**
 * Item 7: converte o reporte aprovado em valores iniciais para o EditarModal (a
 * pré-preenchida). `valor` vira um único item sintético com o total corrigido (mesmo
 * recurso já usado para avisos legados sem itens, ver `itensIniciais` no EditarModal).
 */
function valoresDoReporte(
  reporte: AvisoReporte,
  aviso: Aviso,
): Partial<{ nome_devedor: string; motivo: string; data_combinada: string; itens: ItemPedido[] }> {
  const d = reporte.dados
  if (reporte.campo === 'valor' && d.valor_centavos != null) {
    return { itens: [{ descricao: aviso.motivo, qtd: 1, valor_unit_centavos: d.valor_centavos }] }
  }
  if (reporte.campo === 'data' && d.data_combinada) {
    return { data_combinada: d.data_combinada }
  }
  if (reporte.campo === 'nome_motivo') {
    const v: Partial<{ nome_devedor: string; motivo: string }> = {}
    if (d.nome_devedor) v.nome_devedor = d.nome_devedor
    if (d.motivo) v.motivo = d.motivo
    return v
  }
  return {}
}

/** Quais campos do EditarModal destacar (mudaram por causa da aprovação do reporte). */
function destaquesDoReporte(campo: AvisoReporte['campo']): ReadonlySet<CampoDestacavel> {
  if (campo === 'valor') return new Set(['itens'])
  if (campo === 'data') return new Set(['data_combinada'])
  return new Set(['nome_devedor', 'motivo'])
}

// Item 7: campos do EditarModal que podem ser destacados por virem de uma aprovação de
// reporte de dado incorreto (em vez de uma edição manual normal).
type CampoDestacavel = 'nome_devedor' | 'motivo' | 'data_combinada' | 'itens'

// H2.5: modal de edição (reusa Inputs simples). Para combinado JÁ aceito, mostra o
// aviso de confirmação com o texto exato da história antes de salvar (a alteração vai
// para aprovação do devedor e pausa os lembretes).
//
// Item 7: `valoresIniciais`/`destaques` (opcionais) reabrem este MESMO modal já
// pré-preenchido com o que a pessoa informou como correto ao aprovar um reporte de dado
// incorreto, destacando visualmente os campos alterados (para o cobrador ver o que
// mudou antes de confirmar/enviar). O CÁLCULO de "o que mudou" (montar/itensMudou)
// sempre compara contra o `aviso` ORIGINAL, nunca contra o valor pré-preenchido: assim
// o corpo enviado ao PATCH carrega a correção mesmo se o cobrador só clicar Salvar.
function EditarModal({
  aviso,
  exigeAprovacao,
  salvando,
  valoresIniciais,
  destaques,
  onSalvar,
  onFechar,
}: {
  aviso: Aviso
  exigeAprovacao: boolean
  salvando: boolean
  valoresIniciais?: Partial<{
    nome_devedor: string
    motivo: string
    data_combinada: string
    itens: ItemPedido[]
  }>
  destaques?: ReadonlySet<CampoDestacavel>
  onSalvar: (body: EditarAvisoBody) => void
  onFechar: () => void
}) {
  const [nome, setNome] = useState(valoresIniciais?.nome_devedor ?? aviso.nome_devedor)
  const [motivo, setMotivo] = useState(valoresIniciais?.motivo ?? aviso.motivo)
  const [data, setData] = useState(valoresIniciais?.data_combinada ?? aviso.data_combinada)
  const [pix, setPix] = useState(aviso.pix_chave ?? '')
  const [titular, setTitular] = useState(aviso.pix_titular ?? '')
  const [banco, setBanco] = useState(aviso.pix_banco ?? '')
  const [confirmando, setConfirmando] = useState(false)
  // O valor do combinado vem dos itens. Avisos antigos sem itens ganham uma linha semente
  // (descrição = motivo, preço = valor atual), preservando o total até o dono ajustar.
  // `itensIniciais` é sempre a BASELINE do `aviso` original (para "o que mudou" bater
  // certo); o valor MOSTRADO no formulário pode partir de `valoresIniciais.itens`
  // (correção de um reporte aprovado), por isso os dois ficam separados.
  const itensIniciais = useMemo<ItemPedido[]>(
    () =>
      aviso.itens && aviso.itens.length > 0
        ? aviso.itens
        : [{ descricao: aviso.motivo, qtd: 1, valor_unit_centavos: aviso.valor_centavos }],
    [aviso],
  )
  const [itens, setItens] = useState<ItemPedido[]>(valoresIniciais?.itens ?? itensIniciais)

  const totalItens = somaItensCentavos(itens)
  const itensMudou = JSON.stringify(itens) !== JSON.stringify(itensIniciais)
  const itensInvalido =
    itens.length === 0 || itens.some((i) => i.descricao.trim().length === 0) || totalItens <= 0
  const erroItens = itensInvalido
    ? itens.length === 0
      ? 'Adicione ao menos um item ao pedido.'
      : itens.some((i) => i.descricao.trim().length === 0)
        ? 'Preencha a descrição de todos os itens.'
        : 'O valor do pedido precisa ser maior que zero.'
    : undefined

  // Monta o corpo só com os campos que MUDARAM (edição parcial). O valor não é enviado: o
  // servidor o deriva dos itens. Mudar os itens de forma que altere o total reabre a aprovação.
  function montar(): EditarAvisoBody {
    const body: EditarAvisoBody = {}
    if (nome.trim() && nome.trim() !== aviso.nome_devedor) body.nome_devedor = nome.trim()
    if (motivo.trim() && motivo.trim() !== aviso.motivo) body.motivo = motivo.trim()
    if (data && data !== aviso.data_combinada) body.data_combinada = data
    if (pix.trim() && pix.trim() !== (aviso.pix_chave ?? '')) body.pix_chave = pix.trim()
    if (titular.trim() && titular.trim() !== (aviso.pix_titular ?? '')) body.pix_titular = titular.trim()
    if (banco.trim() && banco.trim() !== (aviso.pix_banco ?? '')) body.pix_banco = banco.trim()
    if (itensMudou && !itensInvalido) body.itens = itens
    return body
  }

  const body = montar()
  const semMudanca = Object.keys(body).length === 0
  // A confirmação de reaprovação só faz sentido quando a mudança afeta o ACORDO: nome, motivo,
  // data, Pix, ou os itens de um jeito que altere o TOTAL. Um ajuste de itens que mantém o total
  // é edição interna livre (o servidor aplica direto), então não pede aprovação.
  const totalMudou = itensMudou && totalItens !== aviso.valor_centavos
  const afetaAcordo =
    body.nome_devedor !== undefined ||
    body.motivo !== undefined ||
    body.data_combinada !== undefined ||
    body.pix_chave !== undefined ||
    body.pix_titular !== undefined ||
    body.pix_banco !== undefined ||
    totalMudou

  function aoSalvar() {
    if (semMudanca || itensInvalido) return
    if (exigeAprovacao && afetaAcordo) {
      setConfirmando(true)
      return
    }
    onSalvar(body)
  }

  return (
    <>
      {/* Portal para o body: a página vive dentro de um `.animate-rise` cujo `transform`
          (fill-mode both) vira bloco de contenção do `position: fixed`, prendendo o overlay
          ao tamanho da página. No body o `inset-0` cobre a viewport inteira. */}
      {createPortal(
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-tinta/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Editar combinado"
        >
        <Card className="flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-y-auto">
          <h2 className="text-lg text-salvia">Editar combinado</h2>
          {destaques && destaques.size > 0 && (
            <Banner tom="info">
              Os campos marcados em destaque abaixo foram alterados porque você aprovou o
              dado reportado como incorreto. Confira antes de salvar.
            </Banner>
          )}
          <CampoDestacado ativo={destaques?.has('nome_devedor') ?? false}>
            <Field label="Nome de quem vai pagar">
              <Input value={nome} onChange={(e) => setNome(e.target.value)} />
            </Field>
          </CampoDestacado>
          <CampoDestacado ativo={destaques?.has('motivo') ?? false}>
            <Field label="Sobre o quê">
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </Field>
          </CampoDestacado>
          <CampoDestacado ativo={destaques?.has('itens') ?? false}>
            <ItensPedido value={itens} onChange={setItens} erro={erroItens} />
          </CampoDestacado>
          <CampoDestacado ativo={destaques?.has('data_combinada') ?? false}>
            <Field label="Data combinada">
              <DateInput value={data} onChange={(e) => setData(e.target.value)} />
            </Field>
          </CampoDestacado>
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
            <Button onClick={aoSalvar} loading={salvando} disabled={semMudanca || itensInvalido}>
              Salvar
            </Button>
          </div>
        </Card>
        </div>,
        document.body,
      )}

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

  // Portal para o body: a página vive dentro de um `.animate-rise` cujo `transform`
  // (fill-mode both) vira bloco de contenção do `position: fixed`, prendendo o overlay
  // ao tamanho da página. No body o `inset-0` cobre a viewport inteira.
  return createPortal(
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
    </div>,
    document.body,
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
