// Criar / editar item. Nome, descricao, preco (centavos), categoria e "sugerir no atendimento".
// A disponibilidade (ligar/desligar, esgotado) tem fluxo proprio na lista, nao fica aqui.
import { useEffect, useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Dialog, Field, Input, MoneyInput, Select } from '@/shared/ui'
import type { ItemResolvido } from '@/shared/contracts/_generated/cardapio'
import { useAtualizarItem, useCriarItem } from '../api'
import { CampoCheck } from './CampoCheck'
import { Textarea } from './Textarea'

interface Props {
  aberto: boolean
  /** Item em edicao; null cria um novo. */
  item: ItemResolvido | null
  /** Categoria pre-selecionada ao criar (a que o botao "+" pertence). */
  categoriaIdInicial: string
  categorias: ReadonlyArray<{ id: string; nome: string }>
  onFechar: () => void
}

export function ItemDialog({ aberto, item, categoriaIdInicial, categorias, onFechar }: Props) {
  const criar = useCriarItem()
  const atualizar = useAtualizarItem()
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [preco, setPreco] = useState<number | null>(0)
  const [categoriaId, setCategoriaId] = useState('')
  const [sugerivel, setSugerivel] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const salvando = criar.isPending || atualizar.isPending

  useEffect(() => {
    if (!aberto) return
    setNome(item?.nome ?? '')
    setDescricao(item?.descricao ?? '')
    setPreco(item?.preco_centavos ?? 0)
    setCategoriaId(item?.categoria_id ?? categoriaIdInicial)
    setSugerivel(item?.sugerivel ?? false)
    setErro(null)
  }, [aberto, item, categoriaIdInicial])

  async function salvar() {
    const n = nome.trim()
    if (!n) {
      setErro('Dê um nome para o item.')
      return
    }
    if (!categoriaId) {
      setErro('Escolha a categoria do item.')
      return
    }
    setErro(null)
    const desc = descricao.trim() || null
    const preco_centavos = preco ?? 0
    try {
      if (item) {
        await atualizar.mutateAsync({
          id: item.id,
          body: { nome: n, descricao: desc, preco_centavos, categoria_id: categoriaId, sugerivel },
        })
      } else {
        await criar.mutateAsync({ categoria_id: categoriaId, nome: n, descricao: desc, preco_centavos, sugerivel })
      }
      onFechar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar o item.')
    }
  }

  return (
    <Dialog
      aberto={aberto}
      onFechar={onFechar}
      titulo={item ? 'Editar item' : 'Novo item'}
      className="max-w-md"
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
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Pizza margherita" maxLength={80} autoFocus />
        </Field>
        <Field label="Descrição" dica="Mostrada ao cliente junto do item. Opcional.">
          <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Opcional" maxLength={500} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Preço">
            <MoneyInput value={preco} onChange={setPreco} />
          </Field>
          <Field label="Categoria">
            <Select
              ariaLabel="Categoria do item"
              value={categoriaId}
              onChange={setCategoriaId}
              options={categorias.map((c) => ({ value: c.id, label: c.nome }))}
            />
          </Field>
        </div>
        <CampoCheck checked={sugerivel} onChange={setSugerivel} titulo="Sugerir no atendimento" />
      </div>
    </Dialog>
  )
}
