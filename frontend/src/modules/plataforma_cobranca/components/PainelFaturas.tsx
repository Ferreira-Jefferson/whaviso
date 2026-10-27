// Faturas (operador): filtros por situacao e competencia, baixa manual (conferencia do Pix) e
// cancelamento. Baixa com `reativar` so reativa se nao restam faturas atrasadas (decide o servidor).
import { useMemo, useState } from 'react'
import { Receipt } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import {
  Badge,
  Banner,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  MoneyText,
  Select,
  Skeleton,
  TableResponsive,
  useToast,
  type ColunaTabela,
  type SelectOption,
} from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import { statusFatura, type FaturaDTO, type StatusFatura } from '@/shared/contracts/_generated/plataforma_cobranca'
import { useCancelarFatura, useFaturas, useNomesContas, usePagarFatura } from '../api'
import {
  ROTULO_STATUS_FATURA,
  TOM_STATUS_FATURA,
  competenciaLonga,
  dataNegocio,
  faturaPendente,
  idCurto,
  ultimasCompetencias,
} from '../rotulos'
import { AreaErro } from './AreaErro'

type FiltroStatus = StatusFatura | 'todas'

const OPCOES_STATUS: ReadonlyArray<SelectOption<FiltroStatus>> = [
  { value: 'todas', label: 'Todas as situações' },
  ...statusFatura.options.map((s) => ({ value: s, label: ROTULO_STATUS_FATURA[s] })),
]

function mensagem(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao
}

export function PainelFaturas() {
  const [status, setStatus] = useState<FiltroStatus>('todas')
  const [competencia, setCompetencia] = useState('todas')
  const [pagando, setPagando] = useState<FaturaDTO | null>(null)
  const [cancelando, setCancelando] = useState<FaturaDTO | null>(null)

  const opcoesCompetencia = useMemo<ReadonlyArray<SelectOption<string>>>(
    () => [
      { value: 'todas', label: 'Todas as competências' },
      ...ultimasCompetencias(12).map((c) => ({ value: c, label: competenciaLonga(c) })),
    ],
    [],
  )

  const lista = useFaturas({
    status: status === 'todas' ? undefined : status,
    competencia: competencia === 'todas' ? undefined : competencia,
  })
  const nomes = useNomesContas()
  const itens = lista.data ?? []
  const nomeConta = (id: string) => nomes.data?.get(id) ?? `Conta ${idCurto(id)}`

  const colunas: ReadonlyArray<ColunaTabela<FaturaDTO>> = [
    { chave: 'conta', titulo: 'Conta', principal: true, render: (f) => <span className="font-medium">{nomeConta(f.conta_id)}</span> },
    { chave: 'competencia', titulo: 'Competência', render: (f) => <span className="text-tinta-2">{competenciaLonga(f.competencia)}</span> },
    { chave: 'valor', titulo: 'Valor', alinhar: 'direita', render: (f) => <MoneyText centavos={f.valor_centavos} /> },
    { chave: 'vencimento', titulo: 'Vencimento', render: (f) => <span className="tabular text-tinta-2">{dataNegocio(f.vencimento)}</span> },
    {
      chave: 'status',
      titulo: 'Situação',
      render: (f) => (
        <span className="flex flex-col gap-0.5">
          <Badge tom={TOM_STATUS_FATURA[f.status]}>{ROTULO_STATUS_FATURA[f.status]}</Badge>
          {f.pago_em && <span className="text-xs text-tinta-2">em {formatarDataHora(f.pago_em)}</span>}
        </span>
      ),
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      ocultarRotuloMobile: true,
      alinhar: 'direita',
      render: (f) =>
        faturaPendente(f.status) ? (
          <span className="flex flex-wrap justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <Button variante="secondary" className="min-h-9 px-3 py-1.5" onClick={() => setPagando(f)}>
              Dar baixa
            </Button>
            <Button variante="ghost" className="min-h-9 px-3 py-1.5" onClick={() => setCancelando(f)}>
              Cancelar
            </Button>
          </span>
        ) : null,
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select ariaLabel="Filtrar por situação" value={status} onChange={setStatus} options={OPCOES_STATUS} className="w-full sm:w-52" />
        <Select ariaLabel="Filtrar por competência" value={competencia} onChange={setCompetencia} options={opcoesCompetencia} className="w-full sm:w-56" />
      </div>

      {lista.isPending && (
        <div aria-busy="true" aria-label="Carregando faturas" className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {lista.isError && <AreaErro erro={lista.error} aoTentarDeNovo={() => void lista.refetch()} />}
      {lista.isSuccess && itens.length === 0 && (
        <EmptyState
          icone={<Receipt className="size-7" aria-hidden />}
          titulo="Nenhuma fatura encontrada"
          descricao="Ajuste os filtros ou gere as faturas do mês na aba Rotinas."
        />
      )}
      {lista.isSuccess && itens.length > 0 && (
        <TableResponsive colunas={colunas} linhas={itens} chaveLinha={(f) => f.id} legenda="Faturas" />
      )}

      <BaixaDialog fatura={pagando} nomeConta={nomeConta} aoFechar={() => setPagando(null)} />
      <CancelarDialog fatura={cancelando} nomeConta={nomeConta} aoFechar={() => setCancelando(null)} />
    </div>
  )
}

function Resumo({ f, nomeConta }: { f: FaturaDTO; nomeConta: (id: string) => string }) {
  return (
    <p>
      <strong>{nomeConta(f.conta_id)}</strong>, {competenciaLonga(f.competencia)}, <MoneyText centavos={f.valor_centavos} />,
      vence em {dataNegocio(f.vencimento)}.
    </p>
  )
}

function BaixaDialog({
  fatura,
  nomeConta,
  aoFechar,
}: {
  fatura: FaturaDTO | null
  nomeConta: (id: string) => string
  aoFechar: () => void
}) {
  return (
    <Dialog aberto={fatura != null} onFechar={aoFechar} titulo="Dar baixa na fatura" className="max-w-md">
      {fatura && <FormBaixa key={fatura.id} fatura={fatura} nomeConta={nomeConta} aoFechar={aoFechar} />}
    </Dialog>
  )
}

function FormBaixa({
  fatura,
  nomeConta,
  aoFechar,
}: {
  fatura: FaturaDTO
  nomeConta: (id: string) => string
  aoFechar: () => void
}) {
  const [reativar, setReativar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const pagar = usePagarFatura()
  const { mostrarToast } = useToast()

  return (
    <div className="flex flex-col gap-4">
      <Resumo f={fatura} nomeConta={nomeConta} />
      <p>Confirme só depois de conferir o Pix da conta. A baixa não pode ser desfeita.</p>
      <label className="flex items-start gap-2 text-sm text-tinta">
        <input
          type="checkbox"
          checked={reativar}
          onChange={(e) => setReativar(e.target.checked)}
          className="mt-0.5 size-4 accent-[var(--color-salvia)]"
        />
        <span>
          Reativar a assinatura se ela estiver suspensa por atraso
          <span className="block text-xs text-tinta-2">Só reativa quando não restarem outras faturas atrasadas.</span>
        </span>
      </label>
      {erro && <Banner tom="erro">{erro}</Banner>}
      <div className="flex flex-col gap-2">
        <Button
          loading={pagar.isPending}
          onClick={() => {
            setErro(null)
            pagar.mutate(
              { id: fatura.id, body: { reativar } },
              {
                onSuccess: () => {
                  mostrarToast('Baixa registrada.', { tom: 'sucesso' })
                  aoFechar()
                },
                onError: (e) => setErro(mensagem(e, 'Não foi possível dar baixa.')),
              },
            )
          }}
        >
          Confirmar pagamento
        </Button>
        <Button variante="secondary" disabled={pagar.isPending} onClick={aoFechar}>
          Voltar
        </Button>
      </div>
    </div>
  )
}

function CancelarDialog({
  fatura,
  nomeConta,
  aoFechar,
}: {
  fatura: FaturaDTO | null
  nomeConta: (id: string) => string
  aoFechar: () => void
}) {
  const cancelar = useCancelarFatura()
  const { mostrarToast } = useToast()
  return (
    <ConfirmDialog
      aberto={fatura != null}
      titulo="Cancelar fatura?"
      variante="destructive"
      textoConfirmar="Cancelar fatura"
      carregando={cancelar.isPending}
      onCancelar={aoFechar}
      onConfirmar={() => {
        if (!fatura) return
        cancelar.mutate(fatura.id, {
          onSuccess: () => {
            mostrarToast('Fatura cancelada.', { tom: 'sucesso' })
            aoFechar()
          },
          onError: (e) => {
            mostrarToast(mensagem(e, 'Não foi possível cancelar.'), { tom: 'erro' })
            aoFechar()
          },
        })
      }}
    >
      {fatura && <Resumo f={fatura} nomeConta={nomeConta} />}
    </ConfirmDialog>
  )
}
