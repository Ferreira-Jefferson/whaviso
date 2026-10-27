// Rotinas de cobranca (execucao manual pelo operador). Ambas sao idempotentes no servidor e tem
// limite de uso por minuto; o agendamento automatico e infraestrutura, fora desta tela.
import { useMemo, useState } from 'react'
import { AlarmClock, ReceiptText } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Card, ConfirmDialog, Field, Select, useToast, type SelectOption } from '@/shared/ui'
import { useApurarAtrasos, useGerarFaturas } from '../api'
import { competenciaLonga, ultimasCompetencias } from '../rotulos'

function mensagem(e: unknown, padrao: string): string {
  if (e instanceof ApiError && e.isRateLimited) return 'Muitas execuções seguidas. Aguarde um minuto e tente de novo.'
  return e instanceof ApiError ? e.message : padrao
}

export function PainelRotinas() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <CartaoGerar />
      <CartaoApurar />
    </div>
  )
}

function CartaoGerar() {
  const [competencia, setCompetencia] = useState('mes_atual')
  const [confirmar, setConfirmar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const gerar = useGerarFaturas()
  const { mostrarToast } = useToast()

  const opcoes = useMemo<ReadonlyArray<SelectOption<string>>>(
    () => [
      { value: 'mes_atual', label: 'Mês corrente' },
      ...ultimasCompetencias(6).map((c) => ({ value: c, label: competenciaLonga(c) })),
    ],
    [],
  )

  const executar = () => {
    setErro(null)
    gerar.mutate(competencia === 'mes_atual' ? {} : { competencia }, {
      onSuccess: () => mostrarToast('Faturas geradas.', { tom: 'sucesso' }),
      onError: (e) => setErro(mensagem(e, 'Não foi possível gerar as faturas.')),
      onSettled: () => setConfirmar(false),
    })
  }

  const r = gerar.data

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 flex-none items-center justify-center rounded-full bg-salvia/10 text-salvia">
          <ReceiptText className="size-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div>
          <h2 className="text-lg text-salvia">Gerar faturas do mês</h2>
          <p className="mt-1 text-sm text-tinta-2">
            Cria a fatura de cada assinatura ativa na competência escolhida. Quem está em teste não é cobrado. Rodar de novo não duplica nada.
          </p>
        </div>
      </div>
      <Field label="Competência">
        <Select ariaLabel="Competência" value={competencia} onChange={setCompetencia} options={opcoes} />
      </Field>
      {erro && <Banner tom="erro">{erro}</Banner>}
      {r && (
        <Banner tom="sucesso">
          Competência de {competenciaLonga(r.competencia)}: {r.geradas}{' '}
          {r.geradas === 1 ? 'fatura gerada' : 'faturas geradas'}, {r.ja_existiam} já existiam.
        </Banner>
      )}
      <Button className="self-start" loading={gerar.isPending} onClick={() => setConfirmar(true)}>
        Gerar faturas
      </Button>
      <ConfirmDialog
        aberto={confirmar}
        titulo="Gerar faturas?"
        textoConfirmar="Gerar"
        carregando={gerar.isPending}
        onCancelar={() => setConfirmar(false)}
        onConfirmar={executar}
      >
        Vai criar as faturas que ainda faltam para{' '}
        {competencia === 'mes_atual' ? 'o mês corrente' : competenciaLonga(competencia)}.
      </ConfirmDialog>
    </Card>
  )
}

function CartaoApurar() {
  const [confirmar, setConfirmar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const apurar = useApurarAtrasos()
  const { mostrarToast } = useToast()

  const executar = () => {
    setErro(null)
    apurar.mutate(undefined, {
      onSuccess: () => mostrarToast('Apuração concluída.', { tom: 'sucesso' }),
      onError: (e) => setErro(mensagem(e, 'Não foi possível apurar os atrasos.')),
      onSettled: () => setConfirmar(false),
    })
  }

  const r = apurar.data

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 flex-none items-center justify-center rounded-full bg-ambar/10 text-ambar">
          <AlarmClock className="size-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div>
          <h2 className="text-lg text-salvia">Apurar atrasos</h2>
          <p className="mt-1 text-sm text-tinta-2">
            Marca como atrasadas as faturas vencidas e suspende a assinatura que passou da carência (7 dias). Uma assinatura suspensa
            faz a loja parar de atender até ser reativada.
          </p>
        </div>
      </div>
      {erro && <Banner tom="erro">{erro}</Banner>}
      {r && (
        <Banner tom={r.assinaturas_suspensas > 0 ? 'erro' : 'sucesso'}>
          {r.marcadas_atrasadas} {r.marcadas_atrasadas === 1 ? 'fatura marcada' : 'faturas marcadas'} como atrasada,{' '}
          {r.assinaturas_suspensas} {r.assinaturas_suspensas === 1 ? 'assinatura suspensa' : 'assinaturas suspensas'}.
        </Banner>
      )}
      <Button className="self-start" variante="secondary" loading={apurar.isPending} onClick={() => setConfirmar(true)}>
        Apurar atrasos
      </Button>
      <ConfirmDialog
        aberto={confirmar}
        titulo="Apurar atrasos?"
        variante="destructive"
        textoConfirmar="Apurar agora"
        carregando={apurar.isPending}
        onCancelar={() => setConfirmar(false)}
        onConfirmar={executar}
      >
        Lojas com fatura atrasada além da carência podem ser suspensas agora.
      </ConfirmDialog>
    </Card>
  )
}
