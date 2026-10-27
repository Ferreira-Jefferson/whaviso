// Visao do DONO DA LOJA: as faturas da Whaviso da propria conta (escopo de loja, nao de operador).
// So o DTO enxuto (competencia, valor, vencimento, situacao); nada de outra conta. 403 para quem
// nao e dono. Pagina para o integrador encaixar no shell da loja (ex.: rota /fatura ou em Conta).
import { CheckCircle2, Receipt } from 'lucide-react'
import {
  Badge,
  Card,
  EmptyState,
  MoneyText,
  PageHeader,
  Skeleton,
  TableResponsive,
  cn,
  type ColunaTabela,
} from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import type { MinhaFaturaDTO } from '@/shared/contracts/_generated/plataforma_cobranca'
import { useMinhasFaturas } from '../api'
import { AreaErro } from '../components/AreaErro'
import { ROTULO_STATUS_FATURA, TOM_STATUS_FATURA, competenciaLonga, dataNegocio } from '../rotulos'

const COLUNAS: ReadonlyArray<ColunaTabela<MinhaFaturaDTO>> = [
  { chave: 'competencia', titulo: 'Referência', principal: true, render: (f) => <span className="font-medium">{competenciaLonga(f.competencia)}</span> },
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
]

/** Resumo acionavel da conta: quanto esta em aberto e o vencimento mais proximo. So apresentacao. */
function ResumoConta({ itens }: { itens: ReadonlyArray<MinhaFaturaDTO> }) {
  const abertas = itens.filter((f) => f.status === 'aberta' || f.status === 'atrasada')
  const total = abertas.reduce((soma, f) => soma + f.valor_centavos, 0)
  const temAtrasada = abertas.some((f) => f.status === 'atrasada')
  const proximoVencimento = abertas.reduce<string | null>(
    (menor, f) => (menor === null || f.vencimento < menor ? f.vencimento : menor),
    null,
  )
  const emDia = abertas.length === 0

  const chip = emDia ? 'bg-folha/10 text-folha' : temAtrasada ? 'bg-barro/10 text-barro' : 'bg-ambar/10 text-ambar'
  const corValor = temAtrasada ? 'text-barro' : 'text-ambar'

  return (
    <Card className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className={cn('inline-flex size-11 flex-none items-center justify-center rounded-full', chip)}>
          {emDia ? <CheckCircle2 className="size-5" strokeWidth={1.75} aria-hidden /> : <Receipt className="size-5" strokeWidth={1.75} aria-hidden />}
        </span>
        <div>
          <span className="text-sm text-tinta-2">{emDia ? 'Situação da conta' : 'Em aberto'}</span>
          {emDia ? (
            <p className="font-display text-xl text-folha">Tudo em dia</p>
          ) : (
            <MoneyText centavos={total} className={cn('block font-display text-3xl tracking-tight', corValor)} />
          )}
        </div>
      </div>
      <div className="sm:text-right">
        {emDia ? (
          <p className="text-sm text-tinta-2">Nenhuma fatura em aberto no momento.</p>
        ) : (
          <>
            <Badge tom={temAtrasada ? 'erro' : 'atencao'}>
              {temAtrasada ? 'Há fatura atrasada' : 'A pagar'}
            </Badge>
            <p className="mt-1.5 text-sm text-tinta-2">
              {abertas.length} {abertas.length === 1 ? 'fatura em aberto' : 'faturas em aberto'}
              {proximoVencimento && (
                <>
                  {', '}
                  {temAtrasada ? 'vencimento mais antigo' : 'próximo vencimento'} em{' '}
                  <span className="tabular text-tinta">{dataNegocio(proximoVencimento)}</span>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </Card>
  )
}

export default function MinhaFatura() {
  const faturas = useMinhasFaturas()
  const itens = faturas.data ?? []
  return (
    <div>
      <PageHeader titulo="Minha fatura" descricao="Cobrança da Whaviso para a sua conta." />
      {faturas.isPending && (
        <div aria-busy="true" aria-label="Carregando faturas" className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {faturas.isError && <AreaErro deDono erro={faturas.error} aoTentarDeNovo={() => void faturas.refetch()} />}
      {faturas.isSuccess && itens.length === 0 && (
        <EmptyState icone={<Receipt className="size-7" aria-hidden />} titulo="Nenhuma fatura ainda" descricao="Quando a primeira fatura for emitida, ela aparece aqui." />
      )}
      {faturas.isSuccess && itens.length > 0 && (
        <>
          <ResumoConta itens={itens} />
          <TableResponsive colunas={COLUNAS} linhas={itens} chaveLinha={(f) => f.id} legenda="Minhas faturas" />
        </>
      )}
    </div>
  )
}
