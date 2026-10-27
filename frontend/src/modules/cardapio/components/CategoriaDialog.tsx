// Criar / editar categoria. Nome e descricao; a categoria pode ser ligada/desligada pela lista.
import { useEffect, useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Dialog, Field, Input, Textarea } from '@/shared/ui'
import type { CategoriaResolvida } from '@/shared/contracts/_generated/cardapio'
import { useAtualizarCategoria, useCriarCategoria } from '../api'

interface Props {
  aberto: boolean
  /** Categoria em edicao; null cria uma nova. */
  categoria: CategoriaResolvida | null
  onFechar: () => void
}

export function CategoriaDialog({ aberto, categoria, onFechar }: Props) {
  const criar = useCriarCategoria()
  const atualizar = useAtualizarCategoria()
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const salvando = criar.isPending || atualizar.isPending

  useEffect(() => {
    if (!aberto) return
    setNome(categoria?.nome ?? '')
    setDescricao(categoria?.descricao ?? '')
    setErro(null)
  }, [aberto, categoria])

  async function salvar() {
    const n = nome.trim()
    if (!n) {
      setErro('Dê um nome para a categoria.')
      return
    }
    const desc = descricao.trim() || null
    setErro(null)
    try {
      if (categoria) {
        await atualizar.mutateAsync({ id: categoria.id, body: { nome: n, descricao: desc } })
      } else {
        await criar.mutateAsync({ nome: n, descricao: desc })
      }
      onFechar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar a categoria.')
    }
  }

  return (
    <Dialog
      aberto={aberto}
      onFechar={onFechar}
      titulo={categoria ? 'Editar categoria' : 'Nova categoria'}
      acoes={
        <>
          <Button className="w-full" loading={salvando} onClick={() => void salvar()}>
            Salvar
          </Button>
          <Button variante="secondary" className="w-full" disabled={salvando} onClick={onFechar}>
            Cancelar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erro && <Banner tom="erro">{erro}</Banner>}
        <Field label="Nome">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Pizzas" maxLength={80} autoFocus />
        </Field>
        <Field label="Descrição" dica="Aparece como apresentação da categoria. Opcional.">
          <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Opcional" maxLength={500} />
        </Field>
      </div>
    </Dialog>
  )
}
