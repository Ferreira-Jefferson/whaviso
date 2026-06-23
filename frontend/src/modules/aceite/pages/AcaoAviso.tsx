// /aviso/:token: ações dos botões do WhatsApp, SEM login.
// Dois botões grandes full-width: "Já paguei" e "Encerrar lembretes" (com
// ConfirmDialog). Idempotente: terminal devolve o recibo do estado atual, nunca erro.
import { useState } from 'react'
import { useParams } from 'react-router'
import { Check, BellOff } from 'lucide-react'
import { Banner, Button, Card, ConfirmDialog, Recibo } from '@/shared/ui'
import { ApiError } from '@/shared/api_client'
import type { AcaoDevedor, StatusAviso } from '@/shared/contracts'
import { useAcao } from '../data'
import { Transparencia } from '../components/Transparencia'

const TOKEN_MIN = 20

export default function AcaoAvisoPage() {
  const { token = '' } = useParams()
  const tokenValido = token.length >= TOKEN_MIN
  const acao = useAcao(token)
  const [confirmandoOptout, setConfirmandoOptout] = useState(false)
  // Guarda qual ação produziu o resultado (recibo distingue paguei × encerrar).
  const [ultima, setUltima] = useState<AcaoDevedor | null>(null)

  if (!tokenValido) return <LinkInvalido />

  function executar(qual: AcaoDevedor) {
    setUltima(qual)
    acao.mutate(qual)
  }

  // Resultado: a api devolve { status, aplicado }. Mostra recibo pelo status atual.
  if (acao.isSuccess) {
    return <ReciboAcao status={acao.data.status} acaoFeita={ultima} />
  }

  if (acao.isError && acao.error instanceof ApiError && acao.error.status === 404) {
    return <LinkInvalido />
  }

  return (
    <div className="flex animate-rise flex-col gap-5">
      <header>
        <h1 className="font-display text-2xl font-semibold text-salvia">
          Seu combinado
        </h1>
        <p className="mt-1 text-sm text-tinta-2">
          O que você gostaria de fazer com este lembrete?
        </p>
      </header>

      {acao.isError && (
        <Banner tom={acao.error instanceof ApiError && acao.error.isRateLimited ? 'info' : 'erro'}>
          {acao.error instanceof ApiError
            ? acao.error.message
            : 'Não foi possível concluir agora. Tente novamente.'}
        </Banner>
      )}

      <Card className="flex flex-col gap-3">
        <Button
          className="w-full py-3"
          loading={acao.isPending && ultima === 'ja_paguei'}
          disabled={acao.isPending}
          onClick={() => executar('ja_paguei')}
        >
          <Check strokeWidth={2} className="size-5" />
          Já paguei
        </Button>

        <Button
          variante="secondary"
          className="w-full py-3"
          disabled={acao.isPending}
          onClick={() => setConfirmandoOptout(true)}
        >
          <BellOff strokeWidth={1.75} className="size-5" />
          Encerrar lembretes
        </Button>
      </Card>

      <Transparencia />

      <ConfirmDialog
        aberto={confirmandoOptout}
        titulo="Encerrar lembretes?"
        textoConfirmar="Sim, encerrar lembretes"
        textoCancelar="Voltar"
        variante="destructive"
        carregando={acao.isPending && ultima === 'optout'}
        onConfirmar={() => {
          setConfirmandoOptout(false)
          executar('optout')
        }}
        onCancelar={() => setConfirmandoOptout(false)}
      >
        Você não receberá mais lembretes sobre este combinado. Tudo bem continuar?
      </ConfirmDialog>
    </div>
  )
}

function ReciboAcao({
  status,
  acaoFeita,
}: {
  status: StatusAviso
  acaoFeita: AcaoDevedor | null
}) {
  if (status === 'pago') {
    return (
      <Recibo tom="sucesso" titulo="Obrigado por avisar">
        Registramos que você já pagou. Quem combinou com você vai conferir e confirmar.
        Você não precisa fazer mais nada.
      </Recibo>
    )
  }
  if (status === 'cancelado') {
    return (
      <Recibo tom="encerrado" titulo="Lembretes encerrados">
        Pronto. Você não receberá mais lembretes sobre este combinado.
      </Recibo>
    )
  }
  // Estado terminal diferente (expirado) ou aviso ainda programado em corrida rara:
  // recibo neutro coerente com a ação tentada.
  if (acaoFeita === 'optout') {
    return (
      <Recibo tom="encerrado" titulo="Lembretes encerrados">
        Você não receberá mais lembretes sobre este combinado.
      </Recibo>
    )
  }
  return (
    <Recibo tom="neutro" titulo="Tudo certo">
      Sua resposta foi registrada. Não há mais nada a fazer por aqui.
    </Recibo>
  )
}

function LinkInvalido() {
  return (
    <Recibo tom="invalido" titulo="Link indisponível">
      Este link não é válido ou já não está mais ativo. Se você recebeu este lembrete
      por WhatsApp, use o botão da mensagem mais recente.
    </Recibo>
  )
}
