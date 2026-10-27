// Lancar item numa comanda aberta. O contrato do salao aceita { item_id, quantidade } e o
// servidor busca nome/preco no cardapio (snapshot); o preco NUNCA vem do cliente.
//
// Limitacao conhecida: o contrato do salao nao expoe uma lista de itens do cardapio e este
// modulo nao pode importar o modulo cardapio (fronteira). Entao o item e informado pelo seu
// id (UUID). Quando o contrato do salao passar a expor a lista, trocar por um seletor aqui.
import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Dialog, Field, Input } from '@/shared/ui'
import { useLancarItem } from '../api'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Props {
  aberto: boolean
  /** Comanda que recebe o item; null quando nenhuma esta selecionada. */
  comandaId: string | null
  onFechar: () => void
}

export function LancarItemDialog({ aberto, comandaId, onFechar }: Props) {
  const lancar = useLancarItem()
  const [itemId, setItemId] = useState('')
  const [quantidade, setQuantidade] = useState(1)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    setItemId('')
    setQuantidade(1)
    setErro(null)
  }, [aberto])

  async function salvar() {
    if (!comandaId) return
    const id = itemId.trim()
    if (!UUID_RE.test(id)) {
      setErro('Informe o id do item do cardapio (UUID).')
      return
    }
    setErro(null)
    try {
      await lancar.mutateAsync({ id: comandaId, body: { item_id: id, quantidade } })
      onFechar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Nao foi possivel lancar o item.')
    }
  }

  return (
    <Dialog
      aberto={aberto}
      onFechar={onFechar}
      titulo="Lancar item"
      className="max-w-md"
      acoes={
        <>
          <Button className="w-full" loading={lancar.isPending} onClick={() => void salvar()}>
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
        <Field label="Item do cardapio" dica="Id (UUID) do item. O preco e o nome vem do cardapio, calculados pelo servidor.">
          <Input
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            autoFocus
            spellCheck={false}
          />
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
      </div>
    </Dialog>
  )
}
