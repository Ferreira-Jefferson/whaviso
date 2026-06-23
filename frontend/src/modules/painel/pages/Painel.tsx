// Painel de controle (E9): home de quem tem conta (/app), POR PAPEL.
// - "Precisa de você": o que aguarda ação (informado_pago como cobrador, edição a aprovar).
// - Totais POR PAPEL (a receber/recebido como cobrador; a pagar/pago como devedor),
//   calculados no BACKEND (centavos); o front só exibe (H9.2/H9.8).
// - Abas que levam à lista filtrada POR PAPEL (/app/avisos?papel=...), navegação por rota;
//   este módulo NUNCA importa o módulo avisos (fronteira do lint).
// Linguagem das Regras de Ouro: a receber/a pagar/recebido/combinado (ver linguagem.ts).
import { Link, useSearchParams } from 'react-router'
import { ArrowDownLeft, ArrowUpRight, Bell, Clock, Inbox, Plus, Wallet } from 'lucide-react'
import {
  AlternarVisaoOwner,
  Button,
  Card,
  DateInput,
  EmptyState,
  PageHeader,
  SegmentedControl,
  Skeleton,
  StatCard,
} from '@/shared/ui'
import { ROTULO_PAPEL, brl, dataPtBR } from '@/shared/format'
import type { PapelAviso, Pendencia } from '@/shared/contracts'
import { usePainelPendencias, usePainelResumo } from '../api'

const ABAS = [
  { value: 'cobrador' as const, label: ROTULO_PAPEL.cobrador },
  { value: 'devedor' as const, label: ROTULO_PAPEL.devedor },
]

const ROTULO_PENDENCIA: Record<Pendencia['tipo'], string> = {
  confirmar_pagamento: 'Aguardando sua confirmação',
  aprovar_edicao: 'Edição aguardando aprovação',
}

export default function PainelPage() {
  const [params, setParams] = useSearchParams()
  const de = params.get('de') ?? ''
  const ate = params.get('ate') ?? ''
  const papel: PapelAviso = params.get('papel') === 'devedor' ? 'devedor' : 'cobrador'

  const { data, isLoading, isError } = usePainelResumo({
    de: de || undefined,
    ate: ate || undefined,
  })
  const pendencias = usePainelPendencias()

  function setParam(chave: string, valor: string | null) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (valor) next.set(chave, valor)
        else next.delete(chave)
        return next
      },
      { replace: true },
    )
  }

  return (
    <div className="animate-rise">
      <AlternarVisaoOwner atual="meus" />
      <PageHeader
        titulo="Painel"
        descricao="Seus combinados a receber e a pagar, num relance."
        acoes={
          <Link
            to="/app/avisos/novo"
            className="inline-flex items-center gap-2 rounded-pill bg-salvia px-5 py-2.5 text-sm font-medium text-papel transition-[background-color] duration-150 hover:bg-tinta"
          >
            <Plus strokeWidth={1.75} className="size-4" />
            Novo aviso
          </Link>
        }
      />

      {/* "Precisa de você": o que aguarda ação do usuário (H9.2). Só aparece com itens. */}
      {!pendencias.isLoading && (pendencias.data?.total ?? 0) > 0 && (
        <Card className="mb-6 border-revisao/30 bg-revisao-claro">
          <h2 className="mb-3 flex items-center gap-2 text-lg text-revisao">
            <Bell strokeWidth={1.75} className="size-5" />
            Precisa de você
          </h2>
          <ul className="flex flex-col divide-y divide-revisao/15">
            {pendencias.data!.itens.map((p) => (
              <li key={`${p.tipo}:${p.aviso_id}`}>
                <Link
                  to={`/app/avisos/${p.aviso_id}`}
                  className="flex items-center justify-between gap-3 py-3 transition-colors hover:text-revisao"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-tinta">
                      {p.nome_outra_ponta} · {p.motivo}
                    </p>
                    <p className="text-xs text-tinta-2">
                      {ROTULO_PENDENCIA[p.tipo]} · data combinada {dataPtBR(p.data_combinada)}
                    </p>
                  </div>
                  <span className="shrink-0 font-medium tabular-nums text-revisao">
                    {brl(p.valor_centavos)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Filtro de período (opcional, na URL) */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-tinta-2">
          De
          <DateInput
            value={de}
            onChange={(e) => setParam('de', e.target.value || null)}
            className="w-44"
            aria-label="Período: data inicial"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-tinta-2">
          Até
          <DateInput
            value={ate}
            onChange={(e) => setParam('ate', e.target.value || null)}
            className="w-44"
            aria-label="Período: data final"
          />
        </label>
        {(de || ate) && (
          <Button
            variante="ghost"
            onClick={() => {
              setParam('de', null)
              setParam('ate', null)
            }}
          >
            Limpar período
          </Button>
        )}
      </div>

      {isError ? (
        <EmptyState
          titulo="Não foi possível carregar os totais"
          descricao="Verifique sua conexão e tente novamente."
        />
      ) : isLoading || !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-card" />
          ))}
        </div>
      ) : (
        <>
          {/* Totais por papel (H9.2). A receber/recebido (cobrador); a pagar/pago (devedor). */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              rotulo="A receber"
              centavos={data.a_receber_centavos}
              tom="ambar"
              icone={<Clock strokeWidth={1.75} className="size-4" />}
              detalhe={`${data.a_receber_qtd} ${data.a_receber_qtd === 1 ? 'combinado' : 'combinados'}`}
            />
            <StatCard
              rotulo="Recebido"
              centavos={data.recebido_centavos}
              tom="folha"
              icone={<ArrowDownLeft strokeWidth={1.75} className="size-4" />}
              detalhe={`${data.recebido_qtd} ${data.recebido_qtd === 1 ? 'combinado' : 'combinados'}`}
            />
            <StatCard
              rotulo="A pagar"
              centavos={data.a_pagar_centavos}
              tom="salvia"
              icone={<Wallet strokeWidth={1.75} className="size-4" />}
              detalhe={`${data.a_pagar_qtd} ${data.a_pagar_qtd === 1 ? 'combinado' : 'combinados'}`}
            />
            <StatCard
              rotulo="Pago"
              centavos={data.pago_centavos}
              tom="neutro"
              icone={<ArrowUpRight strokeWidth={1.75} className="size-4" />}
              detalhe={`${data.pago_qtd} ${data.pago_qtd === 1 ? 'combinado' : 'combinados'}`}
            />
          </div>

          {/* Abas que levam à lista filtrada POR PAPEL (navegação por rota). */}
          <Card className="mt-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg text-salvia">Ver combinados</h2>
                <p className="text-sm text-tinta-2">
                  Abra a lista pelo seu papel: o que você vai receber ou vai pagar.
                </p>
              </div>
              <SegmentedControl<PapelAviso>
                ariaLabel="Papel nos combinados"
                value={papel}
                onChange={(v) => setParam('papel', v)}
                options={ABAS}
              />
            </div>
            <div className="mt-4 border-t border-linha pt-4">
              <Link
                to={`/app/avisos?papel=${papel}`}
                className="inline-flex items-center gap-2 rounded-pill bg-salvia-claro px-5 py-2.5 text-sm font-medium text-salvia transition-[background-color] duration-150 hover:bg-salvia hover:text-papel"
              >
                <Inbox strokeWidth={1.75} className="size-4" />
                Abrir lista · {ROTULO_PAPEL[papel]}
              </Link>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
