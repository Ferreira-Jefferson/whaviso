// /caixa: PDV / caixa fisico do restaurante. Se nao ha sessao aberta, botao Abrir caixa
// (saldo inicial). Com sessao aberta: resumo (totais por forma, movimentos) e as acoes
// Registrar venda / Sangria / Suprimento / Fechar caixa. Tudo em centavos.
// Estados loading/empty/error; mobile-first. Rota 'caixa' (grupo painel).
import { useState } from 'react'
import { Lock, Minus, Plus, TrendingUp, Wallet } from 'lucide-react'
import { Button, EmptyState, ErrorState, PageHeader, Skeleton, useToast } from '@/shared/ui'
import { ApiError } from '@/shared/api_client'
import { formatarCentavos } from '@/shared/format'
import type { MovimentoEntrada } from '@/shared/contracts/_generated/caixa'
import {
  useAbrirCaixa,
  useFecharCaixa,
  useRegistrarMovimento,
  useRelatorioCaixa,
  useSessaoAberta,
} from '../api'
import { AbrirCaixaDialog } from '../components/AbrirCaixaDialog'
import { FecharCaixaDialog } from '../components/FecharCaixaDialog'
import { MovimentoDialog } from '../components/MovimentoDialog'
import { ResumoSessao } from '../components/ResumoSessao'
import { CONFIG_MOVIMENTO, ROTULO_DIFERENCA, tomDaDiferenca, type TipoMovimentoManual } from '../estados'

type DialogAtivo = 'abrir' | 'fechar' | TipoMovimentoManual | null

function mensagemErro(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback
}

export default function Caixa() {
  const sessao = useSessaoAberta()
  const caixa = sessao.data?.caixa ?? null
  const relatorio = useRelatorioCaixa(caixa?.id)

  const abrir = useAbrirCaixa()
  const registrar = useRegistrarMovimento()
  const fechar = useFecharCaixa()
  const { mostrarToast } = useToast()

  const [dialog, setDialog] = useState<DialogAtivo>(null)
  const [erroDialog, setErroDialog] = useState<string | null>(null)

  function abrirDialog(alvo: DialogAtivo) {
    setErroDialog(null)
    setDialog(alvo)
  }

  function fecharDialog() {
    setDialog(null)
    setErroDialog(null)
  }

  function confirmarAbertura(saldoInicialCentavos: number) {
    setErroDialog(null)
    abrir.mutate(
      { saldo_inicial_centavos: saldoInicialCentavos },
      {
        onSuccess: () => {
          fecharDialog()
          mostrarToast('Caixa aberto.')
        },
        onError: (e) => setErroDialog(mensagemErro(e, 'Não foi possível abrir o caixa.')),
      },
    )
  }

  function confirmarMovimento(entrada: MovimentoEntrada) {
    if (!caixa) return
    setErroDialog(null)
    registrar.mutate(
      { caixaId: caixa.id, ...entrada },
      {
        onSuccess: () => {
          fecharDialog()
          mostrarToast(`${CONFIG_MOVIMENTO[entrada.tipo as TipoMovimentoManual].confirmar} concluída.`)
        },
        onError: (e) => setErroDialog(mensagemErro(e, 'Não foi possível registrar o movimento.')),
      },
    )
  }

  function confirmarFechamento(dados: { saldoInformadoCentavos: number; observacoes?: string }) {
    if (!caixa) return
    setErroDialog(null)
    fechar.mutate(
      { caixaId: caixa.id, saldo_informado_centavos: dados.saldoInformadoCentavos, observacoes: dados.observacoes },
      {
        onSuccess: (resultado) => {
          fecharDialog()
          const dif = resultado.diferenca_centavos ?? 0
          const tom = tomDaDiferenca(dif)
          mostrarToast(
            tom === 'exato'
              ? 'Caixa fechado. O valor bateu com o esperado.'
              : `Caixa fechado. ${ROTULO_DIFERENCA[tom]} ${formatarCentavos(Math.abs(dif))}.`,
          )
        },
        onError: (e) => setErroDialog(mensagemErro(e, 'Não foi possível fechar o caixa.')),
      },
    )
  }

  const saldoEsperado = relatorio.data?.saldo_esperado_dinheiro_centavos ?? caixa?.saldo_inicial_centavos ?? 0

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Caixa"
        descricao={
          caixa
            ? 'Registre vendas, sangrias e suprimentos e feche conferindo a gaveta.'
            : 'Abra o caixa para começar a registrar as vendas do turno.'
        }
        acoes={
          caixa ? (
            <Button variante="primary" onClick={() => abrirDialog('venda')}>
              <Plus strokeWidth={1.75} className="size-4" aria-hidden />
              Registrar venda
            </Button>
          ) : sessao.isSuccess ? (
            <Button variante="primary" onClick={() => abrirDialog('abrir')}>
              <Wallet strokeWidth={1.75} className="size-4" aria-hidden />
              Abrir caixa
            </Button>
          ) : undefined
        }
      />

      {sessao.isPending && (
        <div className="grid gap-4" aria-busy="true" aria-label="Carregando caixa">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="grid gap-3 rounded-card border border-linha bg-cartao p-5">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
          <Skeleton className="h-40 w-full rounded-card" />
        </div>
      )}

      {sessao.isError && <ErrorState aoTentarDeNovo={() => void sessao.refetch()} />}

      {sessao.isSuccess && !caixa && (
        <EmptyState
          icone={<Wallet className="size-7" aria-hidden />}
          titulo="Nenhum caixa aberto"
          descricao="Abra o caixa informando o troco que já está na gaveta. Depois registre as vendas e feche conferindo o valor."
          acao={
            <Button variante="primary" onClick={() => abrirDialog('abrir')}>
              <Wallet strokeWidth={1.75} className="size-4" aria-hidden />
              Abrir caixa
            </Button>
          }
        />
      )}

      {sessao.isSuccess && caixa && (
        <div className="grid gap-5">
          <div className="flex flex-wrap gap-2">
            <Button variante="secondary" onClick={() => abrirDialog('suprimento')}>
              <TrendingUp strokeWidth={1.75} className="size-4" aria-hidden />
              Suprimento
            </Button>
            <Button variante="secondary" onClick={() => abrirDialog('sangria')}>
              <Minus strokeWidth={1.75} className="size-4" aria-hidden />
              Sangria
            </Button>
            <Button variante="secondary" onClick={() => abrirDialog('fechar')}>
              <Lock strokeWidth={1.75} className="size-4" aria-hidden />
              Fechar caixa
            </Button>
          </div>

          {relatorio.isPending && <Skeleton className="h-64 w-full rounded-card" />}
          {relatorio.isError && <ErrorState aoTentarDeNovo={() => void relatorio.refetch()} />}
          {relatorio.isSuccess && <ResumoSessao relatorio={relatorio.data} />}
        </div>
      )}

      <AbrirCaixaDialog
        aberto={dialog === 'abrir'}
        carregando={abrir.isPending}
        erro={erroDialog}
        onConfirmar={confirmarAbertura}
        onFechar={fecharDialog}
      />

      <MovimentoDialog
        aberto={dialog === 'venda' || dialog === 'sangria' || dialog === 'suprimento'}
        tipo={(dialog === 'venda' || dialog === 'sangria' || dialog === 'suprimento' ? dialog : 'venda')}
        carregando={registrar.isPending}
        erro={erroDialog}
        onConfirmar={confirmarMovimento}
        onFechar={fecharDialog}
      />

      <FecharCaixaDialog
        aberto={dialog === 'fechar'}
        carregando={fechar.isPending}
        erro={erroDialog}
        saldoEsperadoCentavos={saldoEsperado}
        onConfirmar={confirmarFechamento}
        onFechar={fecharDialog}
      />
    </div>
  )
}
