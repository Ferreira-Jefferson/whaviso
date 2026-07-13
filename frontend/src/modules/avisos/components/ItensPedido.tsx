// Fase A (estudo revendedores): editor OPCIONAL da composição do pedido (o que foi vendido).
// Cada linha é um produto (descrição + quantidade + preço unitário). É o lado "caderno de
// pedidos": quem prefere segue usando só o "Sobre o quê" + valor. Dado INTERNO do dono:
// nunca vai para a outra pessoa. O total dos itens vira sugestão do valor combinado (quem
// usa este editor deixa o whaviso somar); o pai decide como aplicar (ver NovoAviso).
import { Plus, Trash2 } from 'lucide-react'
import { Button, Input, MoneyInput } from '@/shared/ui'
import { brl } from '@/shared/format'
import type { ItemPedido } from '@/shared/contracts'

function somaItens(itens: ItemPedido[]): number {
  return itens.reduce((s, it) => s + it.qtd * it.valor_unit_centavos, 0)
}

const ITEM_VAZIO: ItemPedido = { descricao: '', qtd: 1, valor_unit_centavos: 0 }

export function ItensPedido({
  value,
  onChange,
}: {
  value: ItemPedido[]
  onChange: (itens: ItemPedido[]) => void
}) {
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

  return (
    <div className="flex flex-col gap-3 rounded-card border border-linha bg-areia/30 p-4">
      <div>
        <p className="text-sm font-medium text-tinta">Itens do pedido (opcional)</p>
        <p className="mt-0.5 text-xs text-tinta-2">
          Anote o que a pessoa levou. Fica só para você e soma no valor. Prefere ir direto?
          Deixe em branco e use só o valor acima.
        </p>
      </div>

      {value.length > 0 && (
        <ul className="flex flex-col gap-3">
          {value.map((item, i) => (
            <li key={i} className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="flex-1">
                <Input
                  aria-label={`Descrição do item ${i + 1}`}
                  placeholder="Ex.: Perfume Essencial"
                  maxLength={80}
                  autoComplete="off"
                  value={item.descricao}
                  onChange={(e) => atualizar(i, { descricao: e.target.value })}
                />
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
                  onClick={() => remover(i)}
                >
                  <Trash2 strokeWidth={1.75} className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between">
        <Button type="button" variante="secondary" onClick={adicionar}>
          <Plus strokeWidth={1.75} className="size-4" />
          Adicionar item
        </Button>
        {value.length > 0 && (
          <span className="text-sm text-tinta-2">
            Total: <span className="font-medium text-tinta tabular">{brl(subtotal)}</span>
          </span>
        )}
      </div>
    </div>
  )
}
