// Painel da comanda selecionada: itens lancados, total e as acoes (lancar item, fechar).
// Busca o detalhe por id (useComanda); loading/empty/error proprios. Ao fechar, avisa o pai
// para limpar a selecao. Fechar e pessimista (ConfirmDialog): a mesa volta a ficar livre.
import { useState } from 'react'
import { Plus, Receipt, X } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Button, ConfirmDialog, ErrorState, Skeleton, useToast } from '@/shared/ui'
import { formatarCentavos, formatarHora } from '@/shared/format'
import { useComanda, useFecharComanda } from '../api'

interface Props {
  comandaId: string
  aoLancarItem: () => void
  aoFechada: () => void
  /** Fecha o painel sem encerrar a comanda (volta a grade no mobile). */
  aoVoltar: () => void
}

export function ComandaPanel({ comandaId, aoLancarItem, aoFechada, aoVoltar }: Props) {
  const comanda = useComanda(comandaId)
  const fechar = useFecharComanda()
  const { mostrarToast } = useToast()
  const [confirmando, setConfirmando] = useState(false)

  function confirmarFechar() {
    fechar.mutate(
      { id: comandaId },
      {
        onSuccess: () => {
          setConfirmando(false)
          aoFechada()
        },
        onError: (e) => {
          setConfirmando(false)
          mostrarToast(e instanceof ApiError ? e.message : 'Nao foi possivel fechar a comanda.', { tom: 'erro' })
        },
      },
    )
  }

  const c = comanda.data

  return (
    <section
      aria-label="Comanda aberta"
      className="flex flex-col gap-4 rounded-card border border-linha bg-papel-2 p-4 md:sticky md:top-[76px]"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-salvia">
            {c ? `Comanda - ${c.mesa_nome}` : 'Comanda'}
          </h2>
          {c && <p className="mt-0.5 text-xs text-tinta-2">Aberta as {formatarHora(c.aberta_em)}</p>}
        </div>
        <button
          type="button"
          onClick={aoVoltar}
          aria-label="Fechar painel"
          className="inline-flex size-9 flex-none items-center justify-center rounded-pill text-tinta-2 hover:bg-cartao focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia md:hidden"
        >
          <X strokeWidth={1.75} className="size-4" aria-hidden />
        </button>
      </header>

      {comanda.isPending && (
        <div aria-busy="true" aria-label="Carregando comanda" className="grid gap-2.5">
          <Skeleton className="h-6" />
          <Skeleton className="h-6" />
          <Skeleton className="h-6 w-1/2" />
        </div>
      )}

      {comanda.isError && <ErrorState aoTentarDeNovo={() => void comanda.refetch()} />}

      {comanda.isSuccess && c && (
        <>
          {c.observacoes && <p className="rounded-input bg-cartao px-3 py-2 text-sm text-tinta-2">{c.observacoes}</p>}

          {c.itens.length === 0 ? (
            <div className="flex flex-col items-center gap-1 rounded-card border border-dashed border-linha bg-cartao px-4 py-8 text-center">
              <Receipt className="mb-1 size-6 text-salvia" aria-hidden />
              <p className="text-sm text-tinta">Nenhum item lancado ainda.</p>
              <p className="text-xs text-tinta-2">Use "Lancar item" para comecar a comanda.</p>
            </div>
          ) : (
            <ul className="grid gap-1.5">
              {c.itens.map((item) => (
                <li
                  key={item.id}
                  className="flex items-baseline justify-between gap-3 rounded-input bg-cartao px-3 py-2.5 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-medium tabular-nums text-tinta">{item.quantidade}x</span>{' '}
                    <span className="text-tinta">{item.nome_item}</span>
                    <span className="block text-xs text-tinta-2">{formatarCentavos(item.preco_unitario_centavos)} cada</span>
                  </span>
                  <span className="flex-none font-semibold tabular-nums text-tinta">{formatarCentavos(item.total_centavos)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between border-t border-linha pt-3">
            <span className="text-sm text-tinta-2">Total</span>
            <span className="font-display text-xl font-semibold tabular-nums text-salvia">
              {formatarCentavos(c.total_centavos)}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <Button onClick={aoLancarItem}>
              <Plus strokeWidth={1.75} className="size-4" aria-hidden />
              Lancar item
            </Button>
            <Button variante="secondary" onClick={() => setConfirmando(true)} disabled={fechar.isPending}>
              Fechar comanda
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        aberto={confirmando}
        titulo="Fechar esta comanda?"
        textoConfirmar="Fechar comanda"
        textoCancelar="Voltar"
        carregando={fechar.isPending}
        onConfirmar={confirmarFechar}
        onCancelar={() => setConfirmando(false)}
      >
        A comanda sera encerrada e a mesa volta a ficar livre. Essa acao nao pode ser desfeita.
      </ConfirmDialog>
    </section>
  )
}
