// Editor da composição do pedido (o que foi vendido). Cada linha é um produto (descrição +
// quantidade + preço unitário). O total dos itens É o valor do combinado (derivado): não há
// mais campo de valor avulso. OBRIGATÓRIO: ao menos um item. A descrição tem autocomplete
// baseado em itens que o próprio dono já cadastrou. Componente CONTROLADO (o pai é dono do
// estado: NovoAviso via react-hook-form; o modal de edição via useState), sem importar RHF.
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, InfoHint, Input, MoneyInput } from '@/shared/ui'
import { brl } from '@/shared/format'
import type { ItemPedido } from '@/shared/contracts'
import { useBuscarItemPorNome } from '../api'

function somaItens(itens: ItemPedido[]): number {
  return itens.reduce((s, it) => s + it.qtd * it.valor_unit_centavos, 0)
}

const ITEM_VAZIO: ItemPedido = { descricao: '', qtd: 1, valor_unit_centavos: 0 }

export function ItensPedido({
  value,
  onChange,
  erro,
}: {
  value: ItemPedido[]
  onChange: (itens: ItemPedido[]) => void
  erro?: string
}) {
  // Autocomplete: qual linha está ativa e o termo digitado. Uma única query por vez (a linha
  // ativa). A sugestão escolhida preenche a descrição daquela linha.
  const [linhaAtiva, setLinhaAtiva] = useState<number | null>(null)
  const [prefixoItem, setPrefixoItem] = useState<string | null>(null)
  const sugestoes = useBuscarItemPorNome(linhaAtiva !== null ? prefixoItem : null)
  const itensSugestao = sugestoes.data?.itens ?? []

  function atualizar(indice: number, patch: Partial<ItemPedido>) {
    onChange(value.map((it, i) => (i === indice ? { ...it, ...patch } : it)))
  }
  function adicionar() {
    onChange([...value, { ...ITEM_VAZIO }])
  }
  function remover(indice: number) {
    onChange(value.filter((_, i) => i !== indice))
  }

  const subtotal = somaItens(value)
  const podeRemover = value.length > 1

  return (
    <div className="flex flex-col gap-3 rounded-card border border-linha bg-areia/30 p-4">
      <p className="flex items-center gap-1.5 text-sm font-medium text-tinta">
        Itens do pedido
        <InfoHint
          texto="Anote o que a pessoa levou. O total soma automaticamente e vira o valor do combinado. Fica só para você (a outra pessoa vê apenas o valor)."
          rotulo="Sobre: Itens do pedido"
        />
      </p>

      <ul className="flex flex-col gap-3">
        {value.map((item, i) => (
          <li key={i} className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="relative flex-1">
              <Input
                aria-label={`Descrição do item ${i + 1}`}
                placeholder="Ex.: Perfume Essencial"
                maxLength={80}
                autoComplete="off"
                value={item.descricao}
                onFocus={() => {
                  setLinhaAtiva(i)
                  const t = item.descricao.trim()
                  setPrefixoItem(t.length >= 2 ? t : null)
                }}
                onChange={(e) => {
                  const texto = e.target.value
                  atualizar(i, { descricao: texto })
                  setLinhaAtiva(i)
                  const t = texto.trim()
                  setPrefixoItem(t.length >= 2 ? t : null)
                }}
                onBlur={() => {
                  // Fecha após um tick para o clique numa sugestão (mousedown) chegar antes.
                  window.setTimeout(() => setLinhaAtiva((atual) => (atual === i ? null : atual)), 120)
                }}
              />
              {linhaAtiva === i && itensSugestao.length > 0 && (
                <ul
                  className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-input border border-linha bg-cartao py-1 shadow-lg"
                  role="listbox"
                  aria-label="Itens já usados"
                >
                  {itensSugestao.map((descricao) => (
                    <li key={descricao}>
                      <button
                        type="button"
                        className="flex w-full items-center px-3 py-2 text-left text-sm text-tinta hover:bg-salvia-claro"
                        // mousedown (antes do blur do input) evita fechar a lista antes do clique.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          atualizar(i, { descricao })
                          setLinhaAtiva(null)
                          setPrefixoItem(null)
                        }}
                      >
                        <span className="truncate">{descricao}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex gap-2">
              <input
                aria-label={`Quantidade do item ${i + 1}`}
                type="number"
                inputMode="numeric"
                min={1}
                max={9999}
                value={item.qtd}
                onChange={(e) => atualizar(i, { qtd: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                className="w-16 rounded-input border border-linha bg-cartao px-2 py-2.5 text-center text-sm text-tinta tabular focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
              />
              <div className="w-32">
                <MoneyInput
                  aria-label={`Preço unitário do item ${i + 1}`}
                  value={item.valor_unit_centavos}
                  onChange={(c) => atualizar(i, { valor_unit_centavos: c ?? 0 })}
                />
              </div>
              <Button
                type="button"
                variante="ghost"
                aria-label={`Remover item ${i + 1}`}
                disabled={!podeRemover}
                onClick={() => remover(i)}
              >
                <Trash2 strokeWidth={1.75} className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variante="secondary" onClick={adicionar}>
          <Plus strokeWidth={1.75} className="size-4" />
          Adicionar item
        </Button>
        <span className="text-sm text-tinta-2">
          Total do pedido: <span className="font-medium text-tinta tabular">{brl(subtotal)}</span>
        </span>
      </div>

      {erro && (
        <p className="text-xs text-barro" role="alert">
          {erro}
        </p>
      )}
    </div>
  )
}
