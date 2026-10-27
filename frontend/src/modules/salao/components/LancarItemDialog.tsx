// Lancar item numa comanda aberta. O contrato do salao aceita { item_id, quantidade } e o
// servidor busca nome/preco no cardapio (snapshot); o preco NUNCA vem do cliente.
//
// O item e escolhido num seletor alimentado pela arvore do cardapio (GET /cardapio, via
// api_client, chamada HTTP, nao import do modulo cardapio). Mostramos nome + preco so para
// apresentacao; o que vai no corpo e o item_id escolhido.
import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Dialog, Field, Input, Select, Skeleton } from '@/shared/ui'
import { formatarCentavos } from '@/shared/format'
import { useItensCardapio, useLancarItem } from '../api'

interface Props {
  aberto: boolean
  /** Comanda que recebe o item; null quando nenhuma esta selecionada. */
  comandaId: string | null
  onFechar: () => void
}

export function LancarItemDialog({ aberto, comandaId, onFechar }: Props) {
  const lancar = useLancarItem()
  const itens = useItensCardapio()
  const [itemId, setItemId] = useState('')
  const [quantidade, setQuantidade] = useState(1)
  const [erro, setErro] = useState<string | null>(null)

  const lista = useMemo(() => itens.data ?? [], [itens.data])

  useEffect(() => {
    if (!aberto) return
    setItemId('')
    setQuantidade(1)
    setErro(null)
  }, [aberto])

  // Opcoes do seletor: um placeholder + "Nome (R$ x,xx)". Ordenadas por categoria e nome.
  const opcoes = useMemo(() => {
    const ordenadas = [...lista].sort(
      (a, b) => a.categoria.localeCompare(b.categoria, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'),
    )
    return [
      { value: '', label: 'Selecione um item' },
      ...ordenadas.map((item) => ({ value: item.id, label: `${item.nome} (${formatarCentavos(item.preco_centavos)})` })),
    ]
  }, [lista])

  async function salvar() {
    if (!comandaId) return
    if (!itemId) {
      setErro('Escolha um item do cardapio.')
      return
    }
    setErro(null)
    try {
      await lancar.mutateAsync({ id: comandaId, body: { item_id: itemId, quantidade } })
      onFechar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Nao foi possivel lancar o item.')
    }
  }

  const semItens = itens.isSuccess && lista.length === 0
  const podeSalvar = itens.isSuccess && lista.length > 0

  return (
    <Dialog
      aberto={aberto}
      onFechar={onFechar}
      titulo="Lancar item"
      className="max-w-md"
      acoes={
        <>
          <Button className="w-full" loading={lancar.isPending} disabled={!podeSalvar} onClick={() => void salvar()}>
            Lancar
          </Button>
          <Button variante="secondary" className="w-full" disabled={lancar.isPending} onClick={onFechar}>
            Cancelar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erro && <Banner tom="erro">{erro}</Banner>}

        {itens.isPending && (
          <div aria-busy="true" aria-label="Carregando itens do cardapio" className="grid gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-11" />
          </div>
        )}

        {itens.isError && (
          <div className="flex flex-col gap-3">
            <Banner tom="erro">Nao foi possivel carregar o cardapio.</Banner>
            <Button variante="secondary" onClick={() => void itens.refetch()}>
              Tentar de novo
            </Button>
          </div>
        )}

        {semItens && (
          <Banner tom="info">
            Nenhum item disponivel no cardapio. Cadastre ou ative itens no Cardapio para lancar na comanda.
          </Banner>
        )}

        {podeSalvar && (
          <>
            <Field label="Item do cardapio" dica="O preco e o nome vem do cardapio, calculados pelo servidor no lancamento.">
              <Select ariaLabel="Item do cardapio" value={itemId} onChange={setItemId} options={opcoes} />
            </Field>

            <Field label="Quantidade">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Diminuir quantidade"
                  onClick={() => setQuantidade((q) => Math.max(1, q - 1))}
                  className="inline-flex size-11 flex-none items-center justify-center rounded-pill border border-linha bg-cartao text-tinta hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
                >
                  <Minus strokeWidth={1.75} className="size-4" aria-hidden />
                </button>
                <Input
                  value={String(quantidade)}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/\D/g, ''))
                    setQuantidade(Math.min(99, Math.max(1, Number.isFinite(n) && n > 0 ? n : 1)))
                  }}
                  inputMode="numeric"
                  aria-label="Quantidade"
                  className="w-16 text-center tabular-nums"
                />
                <button
                  type="button"
                  aria-label="Aumentar quantidade"
                  onClick={() => setQuantidade((q) => Math.min(99, q + 1))}
                  className="inline-flex size-11 flex-none items-center justify-center rounded-pill border border-linha bg-cartao text-tinta hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
                >
                  <Plus strokeWidth={1.75} className="size-4" aria-hidden />
                </button>
              </div>
            </Field>
          </>
        )}
      </div>
    </Dialog>
  )
}
