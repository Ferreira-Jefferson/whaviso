// E17: modal de criar/ver/editar um produto do catálogo (nome + preço de venda). Via portal
// para o body (ModalPortal), robusto contra o containing block do `.animate-rise`. Editar o
// NOME propaga o rótulo aos combinados que usam o produto; editar o PREÇO não (só vale para
// combinados novos): a copy avisa isso.
import { useState } from 'react'
import { Banner, Button, Field, Input, MoneyInput, ModalPortal } from '@/shared/ui'
import { ApiError } from '@/shared/api_client'
import type { Produto } from '@/shared/contracts'
import { useAtualizarProduto, useCriarProduto } from '../api'

export function ProdutoModal({
  produto,
  onFechar,
}: {
  /** Produto a editar; ausente = criar um novo. */
  produto: Produto | null
  onFechar: () => void
}) {
  const editando = produto !== null
  const criar = useCriarProduto()
  const atualizar = useAtualizarProduto()

  const [nome, setNome] = useState(produto?.nome ?? '')
  const [preco, setPreco] = useState<number>(produto?.preco_venda_centavos ?? 0)
  const [erro, setErro] = useState<string | null>(null)

  const salvando = criar.isPending || atualizar.isPending
  const nomeMudou = editando && nome.trim() !== produto!.nome

  async function salvar() {
    const n = nome.trim()
    if (!n) return
    setErro(null)
    try {
      if (editando) {
        await atualizar.mutateAsync({
          id: produto!.id,
          body: { nome: n, preco_venda_centavos: preco },
        })
      } else {
        await criar.mutateAsync({ nome: n, preco_venda_centavos: preco })
      }
      onFechar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar o produto.')
    }
  }

  async function arquivarProduto() {
    if (!editando) return
    setErro(null)
    try {
      await atualizar.mutateAsync({ id: produto!.id, body: { arquivado: true } })
      onFechar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível arquivar.')
    }
  }

  return (
    <ModalPortal ariaLabel={editando ? 'Editar produto' : 'Novo produto'} onFechar={onFechar} className="max-w-md">
      <h2 className="text-lg text-salvia">{editando ? 'Editar produto' : 'Novo produto'}</h2>

      {erro && <Banner tom="erro">{erro}</Banner>}

      <Field label="Nome do produto">
        <Input
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Batom vermelho"
          maxLength={80}
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void salvar()
            }
          }}
        />
      </Field>

      <Field
        label="Preço de venda"
        dica="Ponto de partida ao montar um pedido. Combinados já criados mantêm o preço antigo."
      >
        <MoneyInput aria-label="Preço de venda" value={preco} onChange={(c) => setPreco(c ?? 0)} />
      </Field>

      {editando && nomeMudou && (
        <p className="text-xs text-tinta-2">
          Renomear atualiza o rótulo deste produto nos combinados que já o usam. O preço não muda
          nos combinados antigos.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {editando ? (
          <Button variante="ghost" onClick={arquivarProduto} disabled={salvando}>
            Arquivar
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variante="secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button variante="primary" onClick={salvar} loading={salvando} disabled={!nome.trim()}>
            {editando ? 'Salvar' : 'Criar produto'}
          </Button>
        </div>
      </div>
    </ModalPortal>
  )
}
