// E17: aba Produtos da Gestão (/app/gestao/produtos). Lista o catálogo (nome + preço de
// venda); a linha abre o modal para ver/editar; o botão adiciona um novo. Produto é interno
// do dono; nunca vai para a outra pessoa.
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button, Card, EmptyState, MoneyText, Spinner } from '@/shared/ui'
import type { Produto } from '@/shared/contracts'
import { useProdutos } from '../api'
import { ProdutoModal } from '../components/ProdutoModal'

export default function ProdutosPage() {
  const lista = useProdutos()
  // null = fechado; 'novo' = criando; Produto = editando aquele.
  const [modal, setModal] = useState<'novo' | Produto | null>(null)

  const produtos = lista.data ?? []

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-tinta-2">
          Cadastre o que você vende para reaproveitar ao montar um combinado.
        </p>
        <Button type="button" onClick={() => setModal('novo')}>
          <Plus strokeWidth={1.75} className="size-4" />
          Adicionar produto
        </Button>
      </div>

      {lista.isLoading ? (
        <div className="flex min-h-[20vh] items-center justify-center text-salvia">
          <Spinner className="size-6" />
        </div>
      ) : produtos.length === 0 ? (
        <EmptyState
          titulo="Nenhum produto ainda"
          descricao="Adicione o primeiro (ex.: cada item que você revende) para escolher rápido no pedido."
        />
      ) : (
        <Card className="flex flex-col divide-y divide-linha p-0">
          {produtos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setModal(p)}
              className="flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-salvia-claro focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-salvia"
            >
              <span className="min-w-0 truncate text-tinta">{p.nome}</span>
              <MoneyText centavos={p.preco_venda_centavos} className="shrink-0 tabular text-tinta-2" />
            </button>
          ))}
        </Card>
      )}

      <p className="mt-4 text-xs text-tinta-2">
        Arquivar um produto tira ele da lista, mas não muda nenhum combinado que já o usou.
      </p>

      {modal !== null && (
        <ProdutoModal produto={modal === 'novo' ? null : modal} onFechar={() => setModal(null)} />
      )}
    </div>
  )
}
