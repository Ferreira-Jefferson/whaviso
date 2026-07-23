// E17: aba Produtos da Gestão (/app/gestao/produtos). Lista o catálogo (nome + preço de
// venda); a linha abre o modal para ver/editar; o botão adiciona um novo. Produto é interno
// do dono; nunca vai para a outra pessoa.
import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { Button, Card, EmptyState, Input, MoneyText, Spinner } from '@/shared/ui'
import type { Produto } from '@/shared/contracts'
import { useProdutos } from '../api'
import { ProdutoModal } from '../components/ProdutoModal'

export default function ProdutosPage() {
  const lista = useProdutos()
  // null = fechado; 'novo' = criando; Produto = editando aquele.
  const [modal, setModal] = useState<'novo' | Produto | null>(null)
  // Item 10: busca client-side simples (sem paginação/busca no servidor nesta leva; o
  // catálogo hoje é pequeno). Casa pelo nome, sem diferenciar maiúsculas/minúsculas.
  const [busca, setBusca] = useState('')

  const produtos = lista.data ?? []
  const produtosFiltrados = produtos.filter((p) =>
    p.nome.toLowerCase().includes(busca.trim().toLowerCase()),
  )

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

      {produtos.length > 0 && (
        <div className="relative mb-4 sm:w-72">
          <Search
            strokeWidth={1.75}
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tinta-2"
          />
          <Input
            type="search"
            placeholder="Buscar por nome"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
            aria-label="Buscar por nome"
          />
        </div>
      )}

      {lista.isLoading ? (
        <div className="flex min-h-[20vh] items-center justify-center text-salvia">
          <Spinner className="size-6" />
        </div>
      ) : produtos.length === 0 ? (
        <EmptyState
          titulo="Nenhum produto ainda"
          descricao="Adicione o primeiro (ex.: cada item que você revende) para escolher rápido no pedido."
        />
      ) : produtosFiltrados.length === 0 ? (
        <EmptyState
          titulo="Nenhum resultado"
          descricao="Nenhum produto corresponde à sua busca."
        />
      ) : (
        <Card className="flex flex-col divide-y divide-linha p-0">
          {produtosFiltrados.map((p) => (
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
