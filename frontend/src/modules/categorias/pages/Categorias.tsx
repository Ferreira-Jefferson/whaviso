// E16: gerência de categorias (/app/categorias). Criar, renomear, trocar cor e arquivar
// (soft-delete). Categoria é organização interna do dono; nunca vai para o devedor.
import { useState } from 'react'
import { ArrowLeft, Archive, Check, Pencil, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Spinner,
} from '@/shared/ui'
import { ApiError } from '@/shared/api_client'
import type { Categoria } from '@/shared/contracts'
import { useAtualizarCategoria, useCategorias, useCriarCategoria } from '../api'

const COR_PADRAO = '#1e4d3b'

export default function CategoriasPage() {
  const navigate = useNavigate()
  const lista = useCategorias()
  const criar = useCriarCategoria()
  const atualizar = useAtualizarCategoria()

  const [nome, setNome] = useState('')
  const [cor, setCor] = useState(COR_PADRAO)
  const [erro, setErro] = useState<string | null>(null)
  // Edição inline: id em edição + valor do nome sendo digitado.
  const [editId, setEditId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')

  async function criarCategoria() {
    const n = nome.trim()
    if (!n) return
    setErro(null)
    try {
      await criar.mutateAsync({ nome: n, cor })
      setNome('')
      setCor(COR_PADRAO)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível criar a categoria.')
    }
  }

  async function salvarNome(c: Categoria) {
    const n = editNome.trim()
    if (!n || n === c.nome) {
      setEditId(null)
      return
    }
    setErro(null)
    try {
      await atualizar.mutateAsync({ id: c.id, body: { nome: n } })
      setEditId(null)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível renomear.')
    }
  }

  async function arquivar(c: Categoria) {
    setErro(null)
    try {
      await atualizar.mutateAsync({ id: c.id, body: { arquivada: true } })
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível arquivar.')
    }
  }

  const categorias = lista.data ?? []

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Categorias"
        descricao="Organize seus combinados por marca ou linha. Só você vê; nunca aparece para a outra pessoa."
        acoes={
          <Button variante="ghost" onClick={() => navigate('/app')}>
            <ArrowLeft strokeWidth={1.75} className="size-4" />
            Voltar
          </Button>
        }
      />

      {erro && (
        <Banner tom="erro" className="mb-4">
          {erro}
        </Banner>
      )}

      {/* Criar */}
      <Card className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Nova categoria">
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Natura"
              maxLength={40}
              autoComplete="off"
            />
          </Field>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cat-cor" className="text-sm font-medium text-tinta">
            Cor
          </label>
          <input
            id="cat-cor"
            type="color"
            value={cor}
            onChange={(e) => setCor(e.target.value)}
            aria-label="Cor da categoria"
            className="h-10 w-14 cursor-pointer rounded-input border border-linha bg-cartao"
          />
        </div>
        <Button
          type="button"
          onClick={criarCategoria}
          loading={criar.isPending}
          disabled={!nome.trim()}
        >
          Criar
        </Button>
      </Card>

      {/* Lista */}
      {lista.isLoading ? (
        <div className="flex min-h-[20vh] items-center justify-center text-salvia">
          <Spinner className="size-6" />
        </div>
      ) : categorias.length === 0 ? (
        <EmptyState
          titulo="Nenhuma categoria ainda"
          descricao="Crie a primeira acima (ex.: uma para cada marca que você revende)."
        />
      ) : (
        <Card className="flex flex-col divide-y divide-linha p-0">
          {categorias.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3">
              <span
                aria-hidden
                className="size-4 shrink-0 rounded-full border border-linha"
                style={{ backgroundColor: c.cor ?? 'transparent' }}
              />
              {editId === c.id ? (
                <>
                  <Input
                    value={editNome}
                    onChange={(e) => setEditNome(e.target.value)}
                    maxLength={40}
                    autoComplete="off"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variante="ghost"
                    aria-label="Salvar"
                    loading={atualizar.isPending}
                    onClick={() => void salvarNome(c)}
                  >
                    <Check strokeWidth={1.75} className="size-4" />
                  </Button>
                  <Button type="button" variante="ghost" aria-label="Cancelar" onClick={() => setEditId(null)}>
                    <X strokeWidth={1.75} className="size-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-tinta">{c.nome}</span>
                  <Button
                    type="button"
                    variante="ghost"
                    aria-label={`Renomear ${c.nome}`}
                    onClick={() => {
                      setEditId(c.id)
                      setEditNome(c.nome)
                    }}
                  >
                    <Pencil strokeWidth={1.75} className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variante="ghost"
                    aria-label={`Arquivar ${c.nome}`}
                    onClick={() => void arquivar(c)}
                  >
                    <Archive strokeWidth={1.75} className="size-4" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </Card>
      )}

      <p className="mt-4 text-xs text-tinta-2">
        Arquivar tira a categoria da lista e dos filtros. Os combinados que já a usavam
        continuam no histórico, sem perder nada.
      </p>
    </div>
  )
}
