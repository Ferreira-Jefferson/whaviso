// /admin/whatsapp: conexão do WhatsApp pela Meta Cloud API (oficial). O transporte vive
// no `zap`, que valida as credenciais (token + phone_id, vindas do ambiente) e grava o
// status na sessão. Esta tela só REFLETE o status/numero: não há QR nem botão de
// conectar/desconectar, porque a conexão é por credenciais, não por pareamento.
import { RotateCw, Smartphone } from 'lucide-react'
import { Banner, Card, PageHeader, Spinner, cn } from '@/shared/ui'
import { useWhatsappSessao, type WhatsappStatus } from '../api'
import { ChatTeste } from '../components/ChatTeste'

const ROTULO_STATUS: Record<WhatsappStatus, string> = {
  desconectado: 'Não associado',
  conectado: 'Conectado',
}

const ESTILO_STATUS: Record<WhatsappStatus, string> = {
  desconectado: 'bg-papel-2 text-tinta-2',
  conectado: 'bg-salvia-claro text-folha',
}

const LUZ_STATUS: Record<WhatsappStatus, string> = {
  desconectado: 'bg-tinta-2/50',
  conectado: 'bg-salvia',
}

export default function ConexaoPage() {
  const { data, isFetching, refetch } = useWhatsappSessao()
  const status: WhatsappStatus = data?.status ?? 'desconectado'

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Conexão do WhatsApp"
        descricao="O número oficial que envia os avisos e recebe os toques de botão, pela API oficial da Meta."
      />

      <Banner tom="info" className="mb-6">
        A conexão é pela API oficial da Meta (Cloud API), configurada por credenciais no
        servidor. Não há QR para escanear: o status abaixo reflete se as credenciais estão
        válidas e o número está pronto para enviar e receber.
      </Banner>

      <Card className="flex max-w-xl flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-full',
                status === 'conectado' ? 'bg-salvia-claro text-salvia' : 'bg-papel-2 text-tinta-2',
              )}
            >
              <Smartphone strokeWidth={1.75} className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-base text-tinta">
                {status === 'conectado' && data?.numero
                  ? `Número ${data.numero}`
                  : status === 'conectado'
                    ? 'Conectado via API oficial da Meta'
                    : 'O número não está associado a nenhum WhatsApp'}
              </p>
              <p className="text-sm text-tinta-2">
                {status === 'conectado'
                  ? 'Pronto para enviar e receber pela Meta Cloud API.'
                  : 'Registre o número na Meta Cloud API e configure o token e o número no servidor.'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
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
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              aria-label="Verificar status"
              title="Verificar status"
              className="relative flex size-8 items-center justify-center rounded-input text-tinta-2 transition-colors hover:bg-papel hover:text-tinta disabled:opacity-50"
            >
              {isFetching ? (
                <Spinner className="size-4" />
              ) : (
                <>
                  <RotateCw strokeWidth={1.75} className="size-5" />
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

        {/* Mini-chat de teste: só com a conexão ativa. Serve para conferir, na prática,
            se o número envia e recebe (texto livre só dentro da janela de 24h). */}
        {status === 'conectado' && <ChatTeste />}
      </Card>
    </div>
  )
}
