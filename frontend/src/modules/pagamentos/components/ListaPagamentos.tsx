// Cobrancas Pix da loja: filtro por status, ver o codigo copia e cola, marcar pago (conciliar)
// e cancelar as pendentes. Datas em America/Sao_Paulo, valor em centavos.
import { useState } from 'react'
import { Clock, QrCode, Wallet } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  MoneyText,
  SegmentedControl,
  Skeleton,
  TableResponsive,
  useToast,
  type ColunaTabela,
} from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import type { PagamentoSaida } from '@/shared/contracts/_generated/pagamentos'
import type { StatusPagamento } from '@/shared/contracts/_generated/enums'
import { useCancelarPagamento, useConciliarPagamento, usePagamentos } from '../api'
import { ROTULO_STATUS, TOM_STATUS, refPedido } from '../estados'
import { BrCodeDialog } from './BrCodeDialog'

type Filtro = StatusPagamento | 'todos'

const OPCOES = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendente', label: ROTULO_STATUS.pendente },
  { value: 'pago', label: ROTULO_STATUS.pago },
  { value: 'expirado', label: ROTULO_STATUS.expirado },
  { value: 'cancelado', label: ROTULO_STATUS.cancelado },
] as const

type Acao = { tipo: 'conciliar' | 'cancelar'; pagamento: PagamentoSaida }

export function ListaPagamentos() {
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [verCodigo, setVerCodigo] = useState<PagamentoSaida | null>(null)
  const [acao, setAcao] = useState<Acao | null>(null)

  const { mostrarToast } = useToast()
  const consulta = usePagamentos(filtro === 'todos' ? null : filtro)
  const conciliar = useConciliarPagamento()
  const cancelar = useCancelarPagamento()
  const lista = consulta.data ?? []

  // Resumo da lista visível (o filtro define o que entra). Soma o que ainda aguarda Pix:
  // é o dinheiro acionável, por isso ganha destaque acima da tabela.
  const pendentes = lista.filter((p) => p.status === 'pendente')
  const totalAguardando = pendentes.reduce((soma, p) => soma + p.valor_centavos, 0)

  async function confirmar() {
    if (!acao) return
    const { tipo, pagamento } = acao
    try {
      if (tipo === 'conciliar') await conciliar.mutateAsync(pagamento.id)
      else await cancelar.mutateAsync(pagamento.id)
      mostrarToast(tipo === 'conciliar' ? 'Pagamento marcado como pago.' : 'Cobrança cancelada.', { tom: 'sucesso' })
    } catch (e) {
      mostrarToast(e instanceof ApiError ? e.message : 'Não foi possível concluir a ação.', { tom: 'erro' })
    } finally {
      setAcao(null)
    }
  }

  const colunas: ColunaTabela<PagamentoSaida>[] = [
    {
      chave: 'pedido',
      titulo: 'Pedido',
      principal: true,
      render: (p) => (
        <span className="font-medium text-tinta">
          Pedido <span className="tabular font-semibold">#{refPedido(p.pedido_id)}</span>
        </span>
      ),
    },
    {
      chave: 'status',
      titulo: 'Status',
      ocultarRotuloMobile: true,
      render: (p) => <Badge tom={TOM_STATUS[p.status]}>{ROTULO_STATUS[p.status]}</Badge>,
    },
    { chave: 'valor', titulo: 'Valor', alinhar: 'direita', render: (p) => <MoneyText centavos={p.valor_centavos} /> },
    {
      chave: 'quando',
      titulo: 'Quando',
      render: (p) =>
        p.pago_em
          ? `Pago em ${formatarDataHora(p.pago_em)}`
          : p.status === 'pendente' && p.expira_em
            ? `Expira em ${formatarDataHora(p.expira_em)}`
            : `Criado em ${formatarDataHora(p.criado_em)}`,
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      ocultarRotuloMobile: true,
      alinhar: 'direita',
      render: (p) => (
        <div className="flex flex-wrap justify-end gap-2 max-md:w-full">
          {p.br_code && (
            <Button variante="secondary" className="max-md:flex-1" onClick={() => setVerCodigo(p)}>
              <QrCode strokeWidth={1.75} className="size-4" aria-hidden />
              Ver Pix
            </Button>
          )}
          {p.status === 'pendente' && (
            <>
              <Button className="max-md:flex-1" onClick={() => setAcao({ tipo: 'conciliar', pagamento: p })}>
                Marcar pago
              </Button>
              <Button
                variante="ghost"
                className="max-md:flex-1"
                onClick={() => setAcao({ tipo: 'cancelar', pagamento: p })}
              >
                Cancelar
              </Button>
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:px-0 sm:pb-0">
          <SegmentedControl
            ariaLabel="Status da cobrança"
            value={filtro}
            onChange={setFiltro}
            options={OPCOES}
            semQuebra
          />
        </div>
        {pendentes.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-tinta-2">
            <Clock className="size-4 flex-none text-ambar" strokeWidth={1.75} aria-hidden />
            <MoneyText centavos={totalAguardando} className="text-ambar" />
            <span>
              aguardando Pix em {pendentes.length} {pendentes.length === 1 ? 'cobrança' : 'cobranças'}
            </span>
          </p>
        )}
      </div>

      {consulta.isPending && (
        <div aria-busy="true" aria-label="Carregando cobranças" className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {consulta.isError && <ErrorState aoTentarDeNovo={() => void consulta.refetch()} />}
      {consulta.isSuccess && lista.length === 0 && (
        <EmptyState
          icone={<Wallet className="size-7" aria-hidden />}
          titulo="Nenhuma cobrança"
          descricao="As cobranças Pix geradas nos pedidos aparecem aqui."
        />
      )}
      {consulta.isSuccess && lista.length > 0 && (
        <TableResponsive legenda="Cobranças Pix" colunas={colunas} linhas={lista} chaveLinha={(p) => p.id} />
      )}

      <BrCodeDialog pagamento={verCodigo} onFechar={() => setVerCodigo(null)} />
      <ConfirmDialog
        aberto={acao !== null}
        titulo={acao?.tipo === 'conciliar' ? 'Marcar como pago?' : 'Cancelar esta cobrança?'}
        textoConfirmar={acao?.tipo === 'conciliar' ? 'Marcar pago' : 'Cancelar cobrança'}
        textoCancelar="Voltar"
        variante={acao?.tipo === 'cancelar' ? 'destructive' : 'primary'}
        carregando={conciliar.isPending || cancelar.isPending}
        onConfirmar={() => void confirmar()}
        onCancelar={() => setAcao(null)}
      >
        {acao?.tipo === 'conciliar'
          ? 'Confirme só depois de ver o Pix na conta. A conciliação é manual.'
          : 'O código Pix deixa de valer para este pedido.'}
      </ConfirmDialog>
    </div>
  )
}
