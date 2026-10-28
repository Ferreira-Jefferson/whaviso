// Aba "Acerto de motoboys": quanto cada motoboy tem a receber num PERIODO (entregas + fixo + ajustes),
// com os lancamentos expandiveis, ajuste manual e "marcar como pago". O total vem DERIVADO do
// servidor; ao pagar enviamos o total que o dono viu e o servidor recusa (409 total_divergente ou
// periodo_sobreposto) se mudou. Default do periodo: do dia 1 do mes corrente ate hoje (America/Sao_Paulo).
import { useState } from 'react'
import { Bike, CalendarCheck, ChevronDown, Plus } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { formatarCentavos } from '@/shared/format'
import {
  Badge,
  Banner,
  Button,
  Card,
  cn,
  ConfirmDialog,
  DateInput,
  EmptyState,
  ErrorState,
  Skeleton,
  StatCard,
  useToast,
} from '@/shared/ui'
import { useAcertoPeriodo, usePagarAcerto, type AcertoLinha } from '../api'
import { dataBr, hojeSaoPaulo, primeiroDiaDoMesSaoPaulo, rotuloRegime } from '../estados'
import { AjusteAcertoDialog } from './AjusteAcertoDialog'

export function PainelAcerto() {
  const [de, setDe] = useState(primeiroDiaDoMesSaoPaulo)
  const [ate, setAte] = useState(hojeSaoPaulo)
  const [ajustando, setAjustando] = useState<AcertoLinha | null>(null)
  const [pagando, setPagando] = useState<AcertoLinha | null>(null)
  const [erroPagar, setErroPagar] = useState<string | null>(null)

  const acerto = useAcertoPeriodo(de, ate)
  const pagar = usePagarAcerto()
  const { mostrarToast } = useToast()
  const linhas = acerto.data?.linhas ?? []
  const periodoInvalido = de > ate

  function confirmarPagamento() {
    if (!pagando) return
    setErroPagar(null)
    pagar.mutate(
      { motoboy_id: pagando.motoboy_id, de, ate, total_centavos: pagando.total_centavos },
      {
        onSuccess: () => {
          mostrarToast('Pagamento registrado.', { tom: 'sucesso' })
          setPagando(null)
        },
        onError: (e) => {
          // 409 total_divergente/periodo_sobreposto: o acerto mudou desde que o dono viu; recarrega.
          setErroPagar(e instanceof ApiError ? e.message : 'Não foi possível registrar o pagamento.')
          void acerto.refetch()
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-48">
          <label className="mb-1.5 block text-sm font-medium text-tinta" htmlFor="acerto-de">
            De
          </label>
          <DateInput id="acerto-de" value={de} onChange={(e) => e.target.value && setDe(e.target.value)} />
        </div>
        <div className="w-full sm:w-48">
          <label className="mb-1.5 block text-sm font-medium text-tinta" htmlFor="acerto-ate">
            Até
          </label>
          <DateInput id="acerto-ate" value={ate} min={de} onChange={(e) => e.target.value && setAte(e.target.value)} />
        </div>
      </div>

      {periodoInvalido && <Banner tom="atencao">A data inicial não pode ser depois da final.</Banner>}

      {acerto.isPending && (
        <div aria-busy="true" aria-label="Carregando acerto" className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {acerto.isError && <ErrorState aoTentarDeNovo={() => void acerto.refetch()} />}

      {acerto.isSuccess && linhas.length === 0 && (
        <EmptyState
          icone={<Bike className="size-7" aria-hidden />}
          titulo="Nada a acertar neste período"
          descricao={`Nenhum motoboy teve entrega ou ajuste entre ${dataBr(de)} e ${dataBr(ate)}.`}
        />
      )}

      {acerto.isSuccess && linhas.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              rotulo={`Total de ${dataBr(acerto.data.de)} a ${dataBr(acerto.data.ate)}`}
              centavos={acerto.data.total_centavos}
              detalhe={`${linhas.length} ${linhas.length === 1 ? 'motoboy' : 'motoboys'}`}
              icone={<CalendarCheck className="size-4" aria-hidden />}
              tom="salvia"
              destaque
            />
          </div>
          <ul className="flex flex-col gap-3">
            {linhas.map((l) => (
              <li key={l.motoboy_id}>
                <LinhaAcerto
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

      <AjusteAcertoDialog linha={ajustando} aoFechar={() => setAjustando(null)} />

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
              {pagando.motoboy_nome} recebe{' '}
              <strong className="tabular">{formatarCentavos(pagando.total_centavos)}</strong> pelo período de{' '}
              {dataBr(de)} a {dataBr(ate)}. Depois de pago, o período não aceita novos ajustes.
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

function LinhaAcerto({
  linha,
  aoAjustar,
  aoPagar,
}: {
  linha: AcertoLinha
  aoAjustar: () => void
  aoPagar: () => void
}) {
  const incluiFixo = linha.regime_pagamento !== 'por_entrega'
  const incluiEntrega = linha.regime_pagamento !== 'fixo'
  return (
    <Card className={cn('flex flex-col gap-4', linha.pago && 'bg-papel-2')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2 text-base font-medium text-tinta">
            {linha.motoboy_nome}
            <Badge tom="neutro">{rotuloRegime(linha.regime_pagamento, linha.periodicidade_fixo)}</Badge>
            {linha.pago && <Badge tom="sucesso">Pago</Badge>}
          </span>
        </div>
        <span className={cn('tabular text-2xl', linha.pago ? 'text-tinta-2' : 'text-salvia')}>
          {formatarCentavos(linha.total_centavos)}
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-4">
        {incluiEntrega && (
          <>
            <Dado rotulo="Entregas" valor={`${linha.qtd_entregas}`} />
            <Dado rotulo="Valor das entregas" valor={formatarCentavos(linha.entregas_centavos)} />
          </>
        )}
        {incluiFixo && (
          <>
            <Dado rotulo="Dias trabalhados" valor={`${linha.dias_trabalhados}`} />
            <Dado rotulo="Fixo" valor={formatarCentavos(linha.fixo_centavos)} />
          </>
        )}
        <Dado rotulo="Ajustes" valor={formatarCentavos(linha.ajustes_centavos)} negativo={linha.ajustes_centavos < 0} />
      </dl>

      {linha.lancamentos.length > 0 && (
        <details className="group text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-salvia [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
            Ver lançamentos ({linha.lancamentos.length})
          </summary>
          <ul className="mt-2 flex flex-col divide-y divide-linha rounded-input border border-linha">
            {linha.lancamentos.map((lc) => (
              <li key={lc.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 text-tinta-2">
                  <span className="mr-2 text-xs text-tinta-2">{dataBr(lc.data)}</span>
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

      {!linha.pago && (
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

function Dado({ rotulo, valor, negativo }: { rotulo: string; valor: string; negativo?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-start sm:justify-start">
      <dt className="text-tinta-2">{rotulo}</dt>
      <dd className={cn('tabular font-medium', negativo ? 'text-barro' : 'text-tinta')}>{valor}</dd>
    </div>
  )
}
