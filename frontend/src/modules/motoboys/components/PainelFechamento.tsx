// Fechamento do dia por motoboy: quanto cada um tem a receber (entregas + ajustes), com os
// lancamentos expandiveis, ajuste manual e "marcar como pago". O total vem DERIVADO do
// servidor; ao pagar enviamos o total que o dono viu e o servidor recusa (409) se mudou.
import { useState } from 'react'
import { CalendarCheck, Plus } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { formatarCentavos, formatarDataHora, formatarHora } from '@/shared/format'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DateInput,
  EmptyState,
  ErrorState,
  Skeleton,
  StatCard,
  useToast,
} from '@/shared/ui'
import { useFechamentos, usePagarFechamento, type FechamentoLinha } from '../api'
import { dataBr, hojeSaoPaulo } from '../estados'
import { AjusteDialog } from './AjusteDialog'

export function PainelFechamento() {
  const [data, setData] = useState(hojeSaoPaulo)
  const [ajustando, setAjustando] = useState<FechamentoLinha | null>(null)
  const [pagando, setPagando] = useState<FechamentoLinha | null>(null)
  const [erroPagar, setErroPagar] = useState<string | null>(null)

  const fechamento = useFechamentos(data)
  const pagar = usePagarFechamento()
  const { mostrarToast } = useToast()
  const linhas = fechamento.data?.linhas ?? []
  const hoje = hojeSaoPaulo()

  function confirmarPagamento() {
    if (!pagando) return
    setErroPagar(null)
    pagar.mutate(
      { id: pagando.id, totalCentavos: pagando.total_centavos },
      {
        onSuccess: () => {
          mostrarToast('Pagamento registrado.', { tom: 'sucesso' })
          setPagando(null)
        },
        onError: (e) => {
          // 409 total_divergente: o total mudou desde que o dono viu; a lista recarrega com o novo.
          setErroPagar(e instanceof ApiError ? e.message : 'Não foi possível registrar o pagamento.')
          void fechamento.refetch()
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-56">
          <label className="mb-1.5 block text-sm font-medium text-tinta" htmlFor="fechamento-data">
            Dia
          </label>
          <DateInput id="fechamento-data" value={data} onChange={(e) => e.target.value && setData(e.target.value)} />
        </div>
        {data !== hoje && (
          <Button variante="ghost" onClick={() => setData(hoje)}>
            Voltar para hoje
          </Button>
        )}
      </div>

      {fechamento.isPending && (
        <div aria-busy="true" aria-label="Carregando fechamento" className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {fechamento.isError && <ErrorState aoTentarDeNovo={() => void fechamento.refetch()} />}

      {fechamento.isSuccess && linhas.length === 0 && (
        <EmptyState
          icone={<CalendarCheck className="size-7" aria-hidden />}
          titulo="Nada a fechar neste dia"
          descricao={`Nenhum motoboy teve entrega ou ajuste em ${dataBr(data)}.`}
        />
      )}

      {fechamento.isSuccess && linhas.length > 0 && (
        <>
          <StatCard
            rotulo={`Total do dia ${dataBr(fechamento.data.data)}`}
            centavos={fechamento.data.total_centavos}
            detalhe={`${linhas.length} ${linhas.length === 1 ? 'motoboy' : 'motoboys'}`}
            tom="salvia"
            className="sm:max-w-xs"
          />
          <ul className="flex flex-col gap-3">
            {linhas.map((l) => (
              <li key={l.id}>
                <LinhaFechamento
                  linha={l}
                  aoAjustar={() => setAjustando(l)}
                  aoPagar={() => {
                    setErroPagar(null)
                    setPagando(l)
                  }}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <AjusteDialog linha={ajustando} aoFechar={() => setAjustando(null)} />

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
              {pagando.motoboy_nome} recebe <strong className="tabular">{formatarCentavos(pagando.total_centavos)}</strong> pelo dia{' '}
              {dataBr(pagando.data)}. Depois de pago, o dia não aceita novos ajustes.
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

function LinhaFechamento({
  linha,
  aoAjustar,
  aoPagar,
}: {
  linha: FechamentoLinha
  aoAjustar: () => void
  aoPagar: () => void
}) {
  const pago = linha.status === 'pago'
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2 text-base font-medium text-tinta">
            {linha.motoboy_nome}
            <Badge tom={pago ? 'sucesso' : 'atencao'}>{pago ? 'Pago' : 'A pagar'}</Badge>
          </span>
          {pago && linha.pago_em && <span className="text-xs text-tinta-2">Pago em {formatarDataHora(linha.pago_em)}</span>}
        </div>
        <span className="tabular text-2xl text-salvia">{formatarCentavos(linha.total_centavos)}</span>
      </div>

      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <Dado rotulo="Entregas" valor={`${linha.qtd_entregas}`} />
        <Dado rotulo="Valor das entregas" valor={formatarCentavos(linha.entregas_centavos)} />
        <Dado rotulo="Ajustes" valor={formatarCentavos(linha.ajustes_centavos)} />
      </dl>

      {linha.lancamentos.length > 0 && (
        <details className="group text-sm">
          <summary className="cursor-pointer text-salvia">
            Ver lançamentos ({linha.lancamentos.length})
          </summary>
          <ul className="mt-2 flex flex-col divide-y divide-linha rounded-input border border-linha">
            {linha.lancamentos.map((lc) => (
              <li key={lc.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 text-tinta-2">
                  <span className="mr-2 text-xs text-tinta-2">{formatarHora(lc.criado_em)}</span>
                  {lc.tipo === 'entrega' ? 'Entrega' : 'Ajuste'}
                  {lc.descricao ? `: ${lc.descricao}` : ''}
                </span>
                <span className={`tabular flex-none ${lc.valor_centavos < 0 ? 'text-barro' : 'text-tinta'}`}>
                  {formatarCentavos(lc.valor_centavos)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {!pago && (
        <div className="flex flex-wrap gap-2">
          <Button variante="secondary" onClick={aoAjustar}>
            <Plus className="size-4" aria-hidden />
            Lançar ajuste
          </Button>
          <Button onClick={aoPagar}>Marcar como pago</Button>
        </div>
      )}
    </Card>
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-start sm:justify-start">
      <dt className="text-tinta-2">{rotulo}</dt>
      <dd className="tabular font-medium text-tinta">{valor}</dd>
    </div>
  )
}
