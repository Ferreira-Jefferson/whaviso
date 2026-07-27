// E16/E18: modal read-only com os combinados vinculados a uma categoria (todos os estados, com
// e sem aviso; não só o que o catálogo "tem" em si). Via portal (ModalPortal). Renomear/trocar
// cor/arquivar continuam na lista inline (Categorias.tsx); este modal é só a visão de vínculo.
import { ListaCombinados, ModalPortal } from '@/shared/ui'
import type { Categoria } from '@/shared/contracts'
import { useCategoriaCombinados } from '../api'

export function CategoriaModal({ categoria, onFechar }: { categoria: Categoria; onFechar: () => void }) {
  const combinados = useCategoriaCombinados(categoria.id)

  return (
    <ModalPortal ariaLabel={`Combinados de ${categoria.nome}`} onFechar={onFechar} largura="max-w-2xl">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-3.5 shrink-0 rounded-full border border-linha"
          style={{ backgroundColor: categoria.cor ?? 'transparent' }}
        />
        <h2 className="text-lg text-salvia">{categoria.nome}</h2>
      </div>

      <ListaCombinados
        itens={combinados.data?.itens}
        isLoading={combinados.isLoading}
        vazioTitulo="Nenhum combinado"
        vazioDescricao="Nenhum combinado usa esta categoria ainda."
        onFechar={onFechar}
      />
    </ModalPortal>
  )
}
