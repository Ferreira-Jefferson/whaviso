// /admin/whatsapp: conexão do WhatsApp (Baileys). O socket vive no `zap`; esta
// tela só REFLETE a sessão (whats_sessao) e ENFILEIRA comandos via api. O owner
// conecta um aparelho (gera o QR), escaneia, vê o status e pode desconectar.
//
// INTENÇÃO LOCAL: ao clicar conectar/desconectar guardamos a intenção e a
// mantemos até o status REAL do banco chegar ao destino. Isso é necessário
// porque `comando_pendente` zera no instante em que o zap CONSOME o comando,
// antes de concluí-lo (gerar o QR / deslogar). Sem a intenção, a tela piscava de
// volta nesse intervalo e exigia um segundo clique. Enquanto há intenção, a query
// faz poll curto (useWhatsappSessao(true)); fora disso, status é manual (reload).
import { useEffect, useState } from 'react'
import { Power, QrCode, RefreshCw, RotateCw, Smartphone } from 'lucide-react'
import { Banner, Button, Card, PageHeader, Spinner, cn } from '@/shared/ui'
import {
  useConectarWhatsapp,
  useDesconectarWhatsapp,
  useWhatsappSessao,
  type WhatsappStatus,
} from '../api'

const ROTULO_STATUS: Record<WhatsappStatus, string> = {
  desconectado: 'Desconectado',
  aguardando_qr: 'Aguardando leitura do QR',
  conectado: 'Conectado',
}

const ESTILO_STATUS: Record<WhatsappStatus, string> = {
  desconectado: 'bg-papel-2 text-tinta-2',
  aguardando_qr: 'bg-ambar-claro text-ambar',
  conectado: 'bg-salvia-claro text-folha',
}

// Luz indicativa (bolinha) no centro do ícone de reload: cor pelo status atual.
const LUZ_STATUS: Record<WhatsappStatus, string> = {
  desconectado: 'bg-tinta-2/50',
  aguardando_qr: 'bg-ambar',
  conectado: 'bg-salvia',
}

export default function ConexaoPage() {
  const [intencao, setIntencao] = useState<'conectar' | 'desconectar' | null>(null)
  const { data, isFetching, refetch } = useWhatsappSessao(intencao !== null)
  const conectar = useConectarWhatsapp()
  const desconectar = useDesconectarWhatsapp()

  const statusReal = data?.status ?? 'desconectado'
  const qrImg = data?.qr_img ?? null

  // Limpa a intenção quando o banco já reflete o desfecho esperado: conectar
  // termina quando aparece o QR (aguardando_qr) ou conecta; desconectar termina
  // quando o status volta a desconectado.
  useEffect(() => {
    if (intencao === 'conectar' && (statusReal === 'aguardando_qr' || statusReal === 'conectado')) {
      setIntencao(null)
    } else if (intencao === 'desconectar' && statusReal === 'desconectado') {
      setIntencao(null)
    }
  }, [intencao, statusReal])

  // Status efetivo (otimista): durante a intenção mostramos o DESTINO, não o
  // estado intermediário do banco. Conectar mantém a tela no fluxo do QR; cancelar
  // volta na hora para desconectado (sem o cliente ver o "encerrando").
  const status: WhatsappStatus =
    intencao === 'desconectar'
      ? 'desconectado'
      : intencao === 'conectar' && statusReal !== 'conectado'
        ? 'aguardando_qr'
        : statusReal

  const conectando = intencao === 'conectar'
  // Conectar/Gerar: bloqueia em qualquer intenção em curso (evita duplo conectar).
  const ocupadoConectar = intencao !== null || conectar.isPending || desconectar.isPending
  // Cancelar/Desconectar: bloqueia só durante a própria intenção (mas continua
  // disponível durante a geração do QR, para o owner poder abortar).
  const ocupadoDesconectar = intencao === 'desconectar' || desconectar.isPending

  const aoConectar = () => {
    setIntencao('conectar')
    conectar.mutate()
  }
  const aoDesconectar = () => {
    setIntencao('desconectar')
    desconectar.mutate()
  }

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Conexão do WhatsApp"
        descricao="O número que envia os avisos e recebe os toques de botão. Conecte escaneando o QR, como no WhatsApp Web."
      />

      <Banner tom="info" className="mb-6">
        O aparelho conectado aqui é quem dispara todos os avisos. Use um número
        dedicado ao Whaviso e mantenha o celular online.
      </Banner>

      {/* O card NUNCA some no reload: só o ícone vira spinner e as ações ficam
          desabilitadas. O status atualiza no lugar quando a busca conclui. */}
      <Card className="flex max-w-xl flex-col gap-5">
          {/* Cabeçalho do card do aparelho: é AQUI que o status aparece. */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-full',
                  status === 'conectado'
                    ? 'bg-salvia-claro text-salvia'
                    : 'bg-papel-2 text-tinta-2',
                )}
              >
                <Smartphone strokeWidth={1.75} className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-base text-tinta">
                  {status === 'conectado' && data?.numero
                    ? `Número ${data.numero}`
                    : status === 'conectado'
                      ? 'Aparelho conectado'
                      : 'Nenhum aparelho'}
                </p>
                <p className="text-sm text-tinta-2">
                  {status === 'conectado'
                    ? 'Pronto para enviar e receber.'
                    : status === 'aguardando_qr'
                      ? 'Escaneie o QR abaixo para parear.'
                      : 'Conecte um aparelho para começar.'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {/* Badge clicável: ao clicar, verifica o status (load até voltar). */}
              <button
                type="button"
                onClick={() => void refetch()}
                disabled={isFetching}
                title="Verificar status"
                className={cn(
                  'inline-flex items-center rounded-pill px-3 py-1 text-xs font-medium transition-opacity disabled:opacity-80',
                  ESTILO_STATUS[status],
                )}
              >
                {ROTULO_STATUS[status]}
              </button>
              {/* Reload com uma "luz" (bolinha) centralizada indicando o status. */}
              <button
                type="button"
                onClick={() => void refetch()}
                disabled={isFetching}
                aria-label="Verificar status"
                title="Verificar status"
                className="relative flex size-8 items-center justify-center rounded-input text-tinta-2 transition-colors hover:bg-papel hover:text-tinta disabled:opacity-50"
              >
                {isFetching ? (
                  // Durante a busca o ícone vira um spinner pequeno girando.
                  <Spinner className="size-4" />
                ) : (
                  <>
                    <RotateCw strokeWidth={1.75} className="size-5" />
                    {/* Luz (bolinha) centralizada indicando o status atual. */}
                    <span
                      aria-hidden
                      className={cn(
                        'absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full',
                        LUZ_STATUS[status],
                      )}
                    />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Área do QR: só no fluxo de pareamento (status efetivo aguardando_qr,
              que cobre tanto a geração quanto o QR pronto). Três estados no MESMO
              lugar: 1. QR real (qrImg); 2. placeholder esmaecido (ícone de QR,
              claramente inválido) enquanto o QR não chegou; 3. spinner por cima
              enquanto está gerando (conectando) ou atualizando (isFetching). */}
          {status === 'aguardando_qr' && (
            <div className="flex flex-col items-center gap-3 border-t border-linha pt-5">
              <div className="relative flex size-64 items-center justify-center overflow-hidden rounded-card border border-linha bg-cartao p-2">
                {qrImg ? (
                  <img src={qrImg} alt="QR para parear o WhatsApp" className="size-full" />
                ) : (
                  // Placeholder: um QR genérico e esmaecido, só para marcar o lugar.
                  <QrCode aria-hidden strokeWidth={1} className="size-40 text-linha" />
                )}
                {(conectando || isFetching || !qrImg) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-cartao/75">
                    <Spinner className="size-7" />
                  </div>
                )}
              </div>
              <p className="text-center text-xs text-tinta-2">
                No celular: WhatsApp → Aparelhos conectados → Conectar um
                aparelho. Depois de escanear, clique em atualizar para confirmar.
                Se o QR expirar, use Gerar novo QR.
              </p>
            </div>
          )}

          {/* Ações: o botão de conectar fica SEMPRE disponível quando não há aparelho. */}
          <div className="flex flex-wrap gap-2">
            {status === 'conectado' ? (
              <Button
                variante="destructive"
                loading={ocupadoDesconectar}
                disabled={ocupadoDesconectar}
                onClick={aoDesconectar}
              >
                <Power strokeWidth={1.75} className="size-4" />
                Desconectar
              </Button>
            ) : (
              <>
                <Button loading={ocupadoConectar} disabled={ocupadoConectar} onClick={aoConectar}>
                  {status === 'aguardando_qr' ? (
                    <RefreshCw strokeWidth={1.75} className="size-4" />
                  ) : (
                    <QrCode strokeWidth={1.75} className="size-4" />
                  )}
                  {status === 'aguardando_qr' ? 'Gerar novo QR' : 'Conectar um aparelho'}
                </Button>
                {status === 'aguardando_qr' && (
                  <Button
                    variante="secondary"
                    loading={ocupadoDesconectar}
                    disabled={ocupadoDesconectar}
                    onClick={aoDesconectar}
                  >
                    <Power strokeWidth={1.75} className="size-4" />
                    Cancelar
                  </Button>
                )}
              </>
            )}
          </div>
        </Card>
    </div>
  )
}
