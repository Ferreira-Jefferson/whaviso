// Gerencia do cardapio da loja ativa: arvore categorias -> itens (aba Cardapio) e a biblioteca de
// grupos de opcoes (aba Grupos). CRUD por dialog, disponibilidade por interruptor na lista.
// Dados pela api REST (raiz de cache ['cardapio']); nada e decidido no cliente. Rota /cardapio.
import { useCallback, useState } from 'react'
import { FileUp, Plus, UtensilsCrossed, SlidersHorizontal } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Button, EmptyState, ErrorState, SegmentedControl, Skeleton, useToast } from '@/shared/ui'
import type {
  CategoriaResolvida,
  GrupoSaida,
  ItemResolvido,
  OpcaoSaida,
} from '@/shared/contracts/_generated/cardapio'
import {
  useCardapio,
  useDisponibilidadeItem,
  useDisponibilidadeOpcao,
  useGrupos,
} from '../api'
import { ImportarCardapioDialog } from '../components/ImportarCardapioDialog'
import { CategoriaCard } from '../components/CategoriaCard'
import { GrupoCard } from '../components/GrupoCard'
import { CategoriaDialog } from '../components/CategoriaDialog'
import { ItemDialog } from '../components/ItemDialog'
import { GrupoDialog } from '../components/GrupoDialog'
import { OpcaoDialog } from '../components/OpcaoDialog'

type Aba = 'cardapio' | 'grupos'

const ABAS = [
  { value: 'cardapio', label: 'Cardápio' },
  { value: 'grupos', label: 'Grupos de opções' },
] as const

export default function Cardapio() {
  const [aba, setAba] = useState<Aba>('cardapio')
  const { mostrarToast } = useToast()

  const arvore = useCardapio()
  const grupos = useGrupos()
  const dispItem = useDisponibilidadeItem()
  const dispOpcao = useDisponibilidadeOpcao()

  // Estado dos dialogs. `aberto` separado do payload: o payload sobrevive a animacao de fechar.
  const [dlgCategoria, setDlgCategoria] = useState<{ aberto: boolean; categoria: CategoriaResolvida | null }>({ aberto: false, categoria: null })
  const [dlgItem, setDlgItem] = useState<{ aberto: boolean; item: ItemResolvido | null; categoriaId: string }>({ aberto: false, item: null, categoriaId: '' })
  const [dlgGrupo, setDlgGrupo] = useState<{ aberto: boolean; grupo: GrupoSaida | null }>({ aberto: false, grupo: null })
  const [dlgOpcao, setDlgOpcao] = useState<{ aberto: boolean; opcao: OpcaoSaida | null; grupoId: string }>({ aberto: false, opcao: null, grupoId: '' })
  const [importarAberto, setImportarAberto] = useState(false)

  const categorias = arvore.data?.categorias ?? []
  const listaCategorias = categorias.map((c) => ({ id: c.id, nome: c.nome }))
  const ocupadoItemId = dispItem.isPending ? (dispItem.variables?.id ?? null) : null
  const ocupadoOpcaoId = dispOpcao.isPending ? (dispOpcao.variables?.id ?? null) : null

  const aoAlternarItem = useCallback(
    (item: ItemResolvido, ligado: boolean) => {
      dispItem.mutate(
        { id: item.id, body: { ativo: ligado } },
        { onError: (e) => mostrarToast(e instanceof ApiError ? e.message : 'Não foi possível mudar o item.', { tom: 'erro' }) },
      )
    },
    [dispItem, mostrarToast],
  )

  const aoAlternarOpcao = useCallback(
    (opcao: OpcaoSaida, ligado: boolean) => {
      dispOpcao.mutate(
        { id: opcao.id, body: { ativo: ligado } },
        { onError: (e) => mostrarToast(e instanceof ApiError ? e.message : 'Não foi possível mudar a opção.', { tom: 'erro' }) },
      )
    },
    [dispOpcao, mostrarToast],
  )

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-linha pb-4">
        <div>
          <h1 className="text-2xl text-salvia md:text-3xl">Cardápio</h1>
          <p className="mt-1 text-sm text-tinta-2">Categorias, itens e grupos de opções. Ligue e desligue o que está disponível na hora.</p>
        </div>
        {aba === 'cardapio' ? (
          <div className="flex flex-wrap gap-2 max-md:w-full">
            <Button variante="secondary" onClick={() => setImportarAberto(true)} className="max-md:flex-1">
              <FileUp strokeWidth={1.75} className="size-4" aria-hidden />
              Importar
            </Button>
            <Button onClick={() => setDlgCategoria({ aberto: true, categoria: null })} className="max-md:flex-1">
              <Plus strokeWidth={1.75} className="size-4" aria-hidden />
              Nova categoria
            </Button>
          </div>
        ) : (
          <Button onClick={() => setDlgGrupo({ aberto: true, grupo: null })} className="max-md:w-full">
            <Plus strokeWidth={1.75} className="size-4" aria-hidden />
            Novo grupo
          </Button>
        )}
      </header>

      <div className="mb-4 mt-3.5">
        <SegmentedControl ariaLabel="Seção do cardápio" value={aba} onChange={setAba} options={ABAS} />
      </div>

      {aba === 'cardapio' ? (
        <>
          {arvore.isPending && <Esqueleto />}
          {arvore.isError && <ErrorState aoTentarDeNovo={() => void arvore.refetch()} />}
          {arvore.isSuccess && categorias.length === 0 && (
            <EmptyState
              icone={<UtensilsCrossed className="size-7" aria-hidden />}
              titulo="Seu cardápio está vazio"
              descricao="Crie a primeira categoria (ex.: Pizzas, Bebidas) e comece a adicionar itens."
              acao={
                <Button onClick={() => setDlgCategoria({ aberto: true, categoria: null })}>
                  <Plus strokeWidth={1.75} className="size-4" aria-hidden />
                  Nova categoria
                </Button>
              }
            />
          )}
          {arvore.isSuccess && categorias.length > 0 && (
            <div className="grid gap-4">
              {categorias.map((categoria) => (
                <CategoriaCard
                  key={categoria.id}
                  categoria={categoria}
                  ocupadoItemId={ocupadoItemId}
                  aoEditarCategoria={(c) => setDlgCategoria({ aberto: true, categoria: c })}
                  aoNovoItem={(categoriaId) => setDlgItem({ aberto: true, item: null, categoriaId })}
                  aoEditarItem={(item) => setDlgItem({ aberto: true, item, categoriaId: item.categoria_id })}
                  aoAlternarItem={aoAlternarItem}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {grupos.isPending && <Esqueleto />}
          {grupos.isError && <ErrorState aoTentarDeNovo={() => void grupos.refetch()} />}
          {grupos.isSuccess && grupos.data.length === 0 && (
            <EmptyState
              icone={<SlidersHorizontal className="size-7" aria-hidden />}
              titulo="Nenhum grupo de opções"
              descricao="Grupos deixam o cliente escolher tamanho, adicionais e variações de um item."
              acao={
                <Button onClick={() => setDlgGrupo({ aberto: true, grupo: null })}>
                  <Plus strokeWidth={1.75} className="size-4" aria-hidden />
                  Novo grupo
                </Button>
              }
            />
          )}
          {grupos.isSuccess && grupos.data.length > 0 && (
            <div className="grid gap-4">
              {grupos.data.map((grupo) => (
                <GrupoCard
                  key={grupo.id}
                  grupo={grupo}
                  ocupadoOpcaoId={ocupadoOpcaoId}
                  aoEditarGrupo={(g) => setDlgGrupo({ aberto: true, grupo: g })}
                  aoNovaOpcao={(grupoId) => setDlgOpcao({ aberto: true, opcao: null, grupoId })}
                  aoEditarOpcao={(opcao) => setDlgOpcao({ aberto: true, opcao, grupoId: '' })}
                  aoAlternarOpcao={aoAlternarOpcao}
                />
              ))}
            </div>
          )}
        </>
      )}

      <CategoriaDialog
        aberto={dlgCategoria.aberto}
        categoria={dlgCategoria.categoria}
        onFechar={() => setDlgCategoria((s) => ({ ...s, aberto: false }))}
      />
      <ItemDialog
        aberto={dlgItem.aberto}
        item={dlgItem.item}
        categoriaIdInicial={dlgItem.categoriaId}
        categorias={listaCategorias}
        onFechar={() => setDlgItem((s) => ({ ...s, aberto: false }))}
      />
      <GrupoDialog
        aberto={dlgGrupo.aberto}
        grupo={dlgGrupo.grupo}
        onFechar={() => setDlgGrupo((s) => ({ ...s, aberto: false }))}
      />
      <OpcaoDialog
        aberto={dlgOpcao.aberto}
        opcao={dlgOpcao.opcao}
        grupoId={dlgOpcao.grupoId}
        onFechar={() => setDlgOpcao((s) => ({ ...s, aberto: false }))}
      />
      <ImportarCardapioDialog aberto={importarAberto} onFechar={() => setImportarAberto(false)} />
    </div>
  )
}

function Esqueleto() {
  return (
    <div aria-busy="true" aria-label="Carregando cardápio" className="grid gap-4">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-card border border-linha bg-cartao p-4">
          <Skeleton className="h-6 w-1/3" />
          <div className="mt-4 grid gap-3">
            <Skeleton className="h-5" />
            <Skeleton className="h-5" />
          </div>
        </div>
      ))}
    </div>
  )
}
