// /sair-lembretes/:token: opt-out em 1 clique + recibo.
// POST /v1/acao/:token { acao: 'optout' } (público, idempotente).
import { useParams } from 'react-router'
import { BellOff } from 'lucide-react'
import { Banner, Button, Card, Recibo } from '@/shared/ui'
import { ApiError } from '@/shared/api_client'
import { useAcao } from '../data'

const TOKEN_MIN = 20

export default function SairLembretesPage() {
  const { token = '' } = useParams()
  const tokenValido = token.length >= TOKEN_MIN
  const acao = useAcao(token)

  if (!tokenValido) return <LinkInvalido />

  // Sucesso (aplicou agora OU já estava encerrado): mesmo recibo amigável.
  if (acao.isSuccess) {
    return (
      <Recibo tom="encerrado" titulo="Lembretes encerrados">
        Pronto. Você não receberá mais lembretes sobre este combinado.
      </Recibo>
    )
  }

  if (acao.isError && acao.error instanceof ApiError && acao.error.status === 404) {
    return <LinkInvalido />
  }

  return (
    <div className="flex animate-rise flex-col gap-5">
      <header className="text-center">
        <BellOff strokeWidth={1.75} className="mx-auto mb-3 size-10 text-tinta-2" />
        <h1 className="font-display text-2xl font-semibold text-salvia">
          Encerrar lembretes
        </h1>
        <p className="mt-1 text-sm text-tinta-2">
          Confirme para parar de receber lembretes sobre este combinado.
        </p>
      </header>

      {acao.isError && (
        <Banner tom={acao.error instanceof ApiError && acao.error.isRateLimited ? 'info' : 'erro'}>
          {acao.error instanceof ApiError
            ? acao.error.message
            : 'Não foi possível concluir agora. Tente novamente.'}
        </Banner>
      )}

      <Card>
        <Button
          variante="destructive"
          className="w-full py-3"
          loading={acao.isPending}
          onClick={() => acao.mutate('optout')}
        >
          Encerrar os lembretes deste combinado
        </Button>
      </Card>
    </div>
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
