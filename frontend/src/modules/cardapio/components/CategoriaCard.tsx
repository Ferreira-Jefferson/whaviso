// Cartao de uma categoria (estilo comanda): cabecalho com nome e estado, lista de itens e o botao
// de adicionar item. As acoes borbulham para a pagina, que abre os dialogs e dispara as mutacoes.
import { Pencil, Plus } from 'lucide-react'
import { Badge, Button } from '@/shared/ui'
import type { CategoriaResolvida, ItemResolvido } from '@/shared/contracts/_generated/cardapio'
import { ItemLinha } from './ItemLinha'

interface Props {
  categoria: CategoriaResolvida
  ocupadoItemId: string | null
  aoEditarCategoria: (categoria: CategoriaResolvida) => void
  aoNovoItem: (categoriaId: string) => void
  aoEditarItem: (item: ItemResolvido) => void
  aoAlternarItem: (item: ItemResolvido, ligado: boolean) => void
}

export function CategoriaCard({
  categoria,
  ocupadoItemId,
  aoEditarCategoria,
  aoNovoItem,
  aoEditarItem,
  aoAlternarItem,
}: Props) {
  return (
    <section className="overflow-hidden rounded-card border border-linha bg-cartao">
      <header className="flex items-center gap-3 border-b border-linha bg-papel-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="min-w-0 truncate font-display text-lg font-semibold text-salvia">{categoria.nome}</h2>
            {!categoria.ativo && <Badge tom="neutro" className="shrink-0">Desligada</Badge>}
            {categoria.ativo && !categoria.disponivel_agora && <Badge tom="atencao" className="shrink-0">Fora do horário</Badge>}
          </div>
          {categoria.descricao && <p className="mt-0.5 truncate text-xs text-tinta-2">{categoria.descricao}</p>}
        </div>
        <Button
          variante="ghost"
          aria-label={`Editar categoria ${categoria.nome}`}
          onClick={() => aoEditarCategoria(categoria)}
          className="flex-none px-2.5"
        >
          <Pencil strokeWidth={1.75} className="size-4" aria-hidden />
        </Button>
      </header>

      {categoria.itens.length > 0 ? (
        <div className="divide-y divide-linha">
          {categoria.itens.map((item) => (
            <ItemLinha
              key={item.id}
              item={item}
              ocupado={ocupadoItemId === item.id}
              aoAlternar={aoAlternarItem}
              aoEditar={aoEditarItem}
            />
          ))}
        </div>
      ) : (
        <p className="px-4 py-6 text-center text-sm text-tinta-2">Nenhum item nesta categoria ainda.</p>
      )}

      <div className="border-t border-linha p-3">
        <Button variante="secondary" onClick={() => aoNovoItem(categoria.id)} className="w-full">
          <Plus strokeWidth={1.75} className="size-4" aria-hidden />
          Adicionar item
        </Button>
      </div>
    </section>
  )
}
