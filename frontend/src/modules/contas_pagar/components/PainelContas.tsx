// Aba "A pagar": lista de lancamentos com filtro por status e tipo de credor, botao de novo
// lancamento e acao "marcar como pago". O valor enviado ao pagar e o que o usuario viu; o servidor
// recusa (409 total_divergente) se mudou desde entao. Dinheiro em centavos.
import { useMemo, useState } from 'react'
import { CheckCircle2, Clock, HandCoins, Plus } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { formatarCentavos } from '@/shared/format'
import {
  Badge,
  Button,
  Card,
  cn,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  SegmentedControl,
  Skeleton,
  StatCard,
  useToast,
} from '@/shared/ui'
import type { CredorTipo, StatusContaPagar } from '@/shared/contracts/_generated/enums'
import { usePagarConta, useContas, type Conta } from '../api'
import { dataBr, ROTULO_CREDOR } from '../estados'
import { NovaContaDialog } from './NovaContaDialog'

type FiltroStatus = 'todos' | StatusContaPagar
type FiltroCredor = 'todos' | CredorTipo

export function PainelContas() {
  const [status, setStatus] = useState<FiltroStatus>('a_pagar')
  const [credor, setCredor] = useState<FiltroCredor>('todos')
  const [criando, setCriando] = useState(false)
  const [pagando, setPagando] = useState<Conta | null>(null)
  const [erroPagar, setErroPagar] = useState<string | null>(null)

  const contas = useContas({
    status: status === 'todos' ? undefined : status,
    credorTipo: credor === 'todos' ? undefined : credor,
  })
  const pagar = usePagarConta()
  const { mostrarToast } = useToast()
  const itens = useMemo(() => contas.data?.itens ?? [], [contas.data])
  const vazio = contas.isSuccess && itens.length === 0

  const resumo = useMemo(() => {
    const aPagar = itens.filter((c) => c.status === 'a_pagar')
    return {
      aPagarCentavos: aPagar.reduce((s, c) => s + c.valor_centavos, 0),
      aPagarQtd: aPagar.length,
      pagoCentavos: itens.filter((c) => c.status === 'pago').reduce((s, c) => s + c.valor_centavos, 0),
      pagoQtd: itens.length - aPagar.length,
    }
  }, [itens])

  function confirmarPagamento() {
    if (!pagando) return
    setErroPagar(null)
    pagar.mutate(
      { id: pagando.id, valorCentavos: pagando.valor_centavos },
      {
        onSuccess: () => {
          mostrarToast('Pagamento registrado.', { tom: 'sucesso' })
          setPagando(null)
        },
        onError: (e) => {
          // 409 total_divergente: o valor mudou desde que o usuario viu; a lista recarrega com o novo.
          setErroPagar(e instanceof ApiError ? e.message : 'Nao foi possivel registrar o pagamento.')
          void contas.refetch()
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            ariaLabel="Filtrar por status"
            value={status}
            onChange={(v) => setStatus(v as FiltroStatus)}
            options={[
              { value: 'a_pagar', label: 'A pagar' },
              { value: 'pago', label: 'Pagos' },
              { value: 'todos', label: 'Todos' },
            ]}
          />
          <SegmentedControl
            ariaLabel="Filtrar por credor"
            value={credor}
            onChange={(v) => setCredor(v as FiltroCredor)}
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'fornecedor', label: 'Fornecedores' },
              { value: 'pessoa', label: 'Pessoas' },
            ]}
          />
        </div>
        <Button onClick={() => setCriando(true)} className="max-sm:w-full">
          <Plus className="size-4" aria-hidden />
          Novo lancamento
        </Button>
      </div>

      {contas.isPending && (
        <div aria-busy="true" aria-label="Carregando contas" className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}
      {contas.isError && <ErrorState aoTentarDeNovo={() => void contas.refetch()} />}

      {vazio && (
        <EmptyState
          icone={<HandCoins className="size-7" aria-hidden />}
          titulo="Nenhuma conta neste filtro"
          descricao="Lance o que a loja tem a pagar a fornecedores e pessoas."
          acao={
            <Button onClick={() => setCriando(true)}>
              <Plus className="size-4" aria-hidden />
              Novo lancamento
            </Button>
          }
        />
      )}

      {contas.isSuccess && itens.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatCard
              rotulo="A pagar"
              centavos={resumo.aPagarCentavos}
              detalhe={`${resumo.aPagarQtd} ${resumo.aPagarQtd === 1 ? 'conta' : 'contas'}`}
              icone={<Clock className="size-4" aria-hidden />}
              tom="ambar"
            />
            <StatCard
              rotulo="Pago"
              centavos={resumo.pagoCentavos}
              detalhe={`${resumo.pagoQtd} ${resumo.pagoQtd === 1 ? 'conta' : 'contas'}`}
              icone={<CheckCircle2 className="size-4" aria-hidden />}
              tom="folha"
            />
          </div>
          <ul className="flex flex-col gap-3">
            {itens.map((c) => (
              <li key={c.id}>
                <LinhaConta
                  conta={c}
                  aoPagar={() => {
                    setErroPagar(null)
                    setPagando(c)
                  }}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <NovaContaDialog aberto={criando} aoFechar={() => setCriando(false)} />

      <ConfirmDialog
        aberto={pagando != null}
        titulo="Marcar como pago?"
        textoConfirmar="Confirmar pagamento"
        carregando={pagar.isPending}
        onConfirmar={confirmarPagamento}
        onCancelar={() => setPagando(null)}
      >
        {pagando && (
          <span className="flex flex-col gap-2">
            <span>
              {pagando.credor_nome} recebe <strong className="tabular">{formatarCentavos(pagando.valor_centavos)}</strong> por{' '}
              {pagando.descricao}. Depois de pago, o lancamento nao aceita mais edicao.
            </span>
            {erroPagar && (
              <span role="alert" className="text-barro">
                {erroPagar}
              </span>
            )}
          </span>
        )}
      </ConfirmDialog>
    </div>
  )
}

function LinhaConta({ conta, aoPagar }: { conta: Conta; aoPagar: () => void }) {
  const pago = conta.status === 'pago'
  return (
    <Card className={cn('flex flex-col gap-3', pago && 'bg-papel-2')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2 text-base font-medium text-tinta">
            <span className="truncate">{conta.credor_nome}</span>
            <Badge tom={pago ? 'sucesso' : 'atencao'}>{pago ? 'Pago' : 'A pagar'}</Badge>
            <Badge tom="neutro">{ROTULO_CREDOR[conta.credor_tipo]}</Badge>
          </span>
          <span className="text-sm text-tinta-2">{conta.descricao}</span>
          <span className="text-xs text-tinta-2">
            {conta.vencimento ? `Vence em ${dataBr(conta.vencimento)}` : 'Sem vencimento'}
          </span>
        </div>
        <span className={cn('tabular text-2xl', pago ? 'text-tinta-2' : 'text-salvia')}>
          {formatarCentavos(conta.valor_centavos)}
        </span>
      </div>

      {!pago && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={aoPagar}>Marcar como pago</Button>
        </div>
      )}
    </Card>
  )
}
