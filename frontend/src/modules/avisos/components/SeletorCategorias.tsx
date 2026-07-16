// E16 (multi): seletor de VÁRIAS categorias do combinado. Chips das escolhidas (com remover),
// um select para adicionar uma categoria existente e a criação inline de uma nova (reaproveita
// a lógica de `__nova__` do antigo select único). Categoria é interna do dono; nunca vai para a
// outra pessoa. Controlado: value = ids escolhidos; onChange devolve a nova lista.
import { useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { Input, Select } from '@/shared/ui'
import { ApiError } from '@/shared/api_client'
import { useCategorias, useCriarCategoria } from '../api'

// Sentinela da 1ª opção do select "adicionar": abre o input de criação (não é uma categoria).
const NOVA_CATEGORIA = '__nova__'

export function SeletorCategorias({
  value,
  onChange,
  onErro,
}: {
  value: string[]
  onChange: (ids: string[]) => void
  /** Reporta um erro (ex.: criar categoria falhou) ao pai, que mostra o Banner. */
  onErro?: (mensagem: string) => void
}) {
  const categorias = useCategorias()
  const criarCategoria = useCriarCategoria()
  const [mostrarNova, setMostrarNova] = useState(false)
  const [novaNome, setNovaNome] = useState('')

  const cats = categorias.data ?? []
  const selecionadas = cats.filter((c) => value.includes(c.id))
  const disponiveis = cats.filter((c) => !value.includes(c.id))

  function remover(id: string) {
    onChange(value.filter((x) => x !== id))
  }
  function adicionar(id: string) {
    if (!value.includes(id)) onChange([...value, id])
  }

  async function criarInline() {
    const nome = novaNome.trim()
    if (!nome) return
    try {
      const c = await criarCategoria.mutateAsync({ nome })
      onChange([...value, c.id])
      setNovaNome('')
      setMostrarNova(false)
    } catch (e) {
      onErro?.(e instanceof ApiError ? e.message : 'Não foi possível criar a categoria.')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Chips das categorias escolhidas. */}
      {selecionadas.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {selecionadas.map((c) => (
            <li key={c.id}>
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-salvia-claro py-1 pl-3 pr-1.5 text-sm text-salvia">
                <span
                  aria-hidden
                  className="size-2.5 rounded-full border border-linha"
                  style={{ backgroundColor: c.cor ?? 'transparent' }}
                />
                {c.nome}
                <button
                  type="button"
                  aria-label={`Remover categoria ${c.nome}`}
                  onClick={() => remover(c.id)}
                  className="rounded-full p-0.5 text-salvia transition-colors hover:bg-salvia hover:text-papel"
                >
                  <X strokeWidth={2} className="size-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {mostrarNova ? (
        <div className="relative">
          <Input
            autoFocus
            value={novaNome}
            onChange={(e) => setNovaNome(e.target.value)}
            placeholder="Nome da nova categoria"
            maxLength={40}
            autoComplete="off"
            aria-label="Nome da nova categoria"
            className="pr-20"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void criarInline()
              } else if (e.key === 'Escape') {
                setNovaNome('')
                setMostrarNova(false)
              }
            }}
          />
          <div className="absolute inset-y-0 right-2 flex items-center gap-1">
            <button
              type="button"
              aria-label="Criar categoria"
              disabled={criarCategoria.isPending || novaNome.trim().length === 0}
              onClick={criarInline}
              className="rounded-lg border border-salvia/40 p-1.5 text-salvia transition-colors hover:bg-salvia-claro disabled:cursor-not-allowed disabled:border-linha disabled:text-tinta-2/50 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
            >
              {criarCategoria.isPending ? (
                <Loader2 strokeWidth={1.75} className="size-4 animate-spin" />
              ) : (
                <Check strokeWidth={2} className="size-4" />
              )}
            </button>
            <button
              type="button"
              aria-label="Cancelar"
              onClick={() => {
                setNovaNome('')
                setMostrarNova(false)
              }}
              className="rounded-lg border border-linha p-1.5 text-tinta-2 transition-colors hover:bg-areia hover:text-barro focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
            >
              <X strokeWidth={2} className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        // O select serve só para ADICIONAR: volta a "" após escolher. "+ Nova categoria" abre o input.
        <Select
          ariaLabel="Adicionar categoria"
          value=""
          onChange={(v) => {
            if (v === NOVA_CATEGORIA) {
              setMostrarNova(true)
              return
            }
            if (v) adicionar(v)
          }}
          options={[
            { value: '', label: selecionadas.length > 0 ? 'Adicionar outra categoria' : 'Escolher categoria' },
            {
              value: NOVA_CATEGORIA,
              label: '+ Nova categoria',
              className: 'bg-salvia-claro font-semibold text-salvia',
            },
            ...disponiveis.map((c) => ({ value: c.id, label: c.nome })),
          ]}
        />
      )}
    </div>
  )
}
