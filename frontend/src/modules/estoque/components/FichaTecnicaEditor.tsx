// Editor da ficha tecnica de UM item do cardapio: a lista de {insumo, quantidade} que uma
// unidade vendida do item consome (para dar baixa no estoque na venda). Salvar substitui a
// ficha inteira (lista vazia zera). Insumo repetido e rejeitado.
//
// O item e escolhido num seletor alimentado por GET /cardapio (hook useItensCardapio): e
// chamada HTTP + contrato _generated compartilhado, nao import do slice cardapio (modulo nao
// importa modulo vale para CODIGO). O insumo de cada linha vem da lista de insumos (useInsumos),
// passada por prop.
import { useEffect, useMemo, useState } from 'react'
import { Boxes, Plus, Trash2 } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import {
  Banner,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
  useToast,
} from '@/shared/ui'
import type { InsumoDto } from '@/shared/contracts/_generated/estoque_insumos'
import { useDefinirFichaTecnica, useFichaTecnica, useItensCardapio } from '../api'
import { parseQuantidade } from '../estados'

interface LinhaEditavel {
  /** Chave estavel so da UI (nao vai pro servidor). */
  key: string
  insumo_id: string
  quantidade: string
}

interface Props {
  insumos: InsumoDto[]
}

let contador = 0
const novaKey = () => `l${(contador += 1)}`

export function FichaTecnicaEditor({ insumos }: Props) {
  const { mostrarToast } = useToast()
  const [itemId, setItemId] = useState<string>('')
  const [linhas, setLinhas] = useState<LinhaEditavel[]>([])
  const [erro, setErro] = useState<string | null>(null)

  const itens = useItensCardapio()
  const ficha = useFichaTecnica(itemId || null)
  const definir = useDefinirFichaTecnica()

  // Ao carregar a ficha do servidor, semeia as linhas editaveis.
  useEffect(() => {
    if (!ficha.isSuccess) return
    setLinhas(
      ficha.data.linhas.map((l) => ({
        key: novaKey(),
        insumo_id: l.insumo_id,
        quantidade: String(l.quantidade).replace('.', ','),
      })),
    )
    setErro(null)
  }, [ficha.isSuccess, ficha.data])

  // So os insumos ativos entram no seletor (insumo inativo ja selecionado continua visivel).
  const opcoesInsumo = useMemo(() => {
    const ativos = insumos.filter((i) => i.ativo)
    return (selecionadoId: string) => {
      const base = ativos
      const falta = selecionadoId && !ativos.some((i) => i.id === selecionadoId)
        ? insumos.filter((i) => i.id === selecionadoId)
        : []
      return [...base, ...falta].map((i) => ({ value: i.id, label: `${i.nome} (${i.unidade})` }))
    }
  }, [insumos])

  const opcoesItem = useMemo(() => {
    const base = (itens.data ?? []).map((i) => ({
      value: i.id,
      label: `${i.nome} (${i.categoria})`,
    }))
    return [{ value: '', label: 'Selecione um item...' }, ...base]
  }, [itens.data])

  function alterarLinha(key: string, patch: Partial<LinhaEditavel>) {
    setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function removerLinha(key: string) {
    setLinhas((ls) => ls.filter((l) => l.key !== key))
  }

  function adicionarLinha() {
    setLinhas((ls) => [...ls, { key: novaKey(), insumo_id: '', quantidade: '' }])
  }

  async function salvar() {
    if (!itemId) return
    const montadas: { insumo_id: string; quantidade: number }[] = []
    for (const l of linhas) {
      if (!l.insumo_id) {
        setErro('Escolha o insumo em todas as linhas (ou remova as vazias).')
        return
      }
      const q = parseQuantidade(l.quantidade)
      if (q === null || q <= 0) {
        setErro('Cada linha precisa de uma quantidade maior que zero.')
        return
      }
      montadas.push({ insumo_id: l.insumo_id, quantidade: q })
    }
    if (new Set(montadas.map((m) => m.insumo_id)).size !== montadas.length) {
      setErro('Há insumo repetido na ficha. Deixe cada insumo uma vez só.')
      return
    }
    setErro(null)
    try {
      await definir.mutateAsync({ itemId, body: { linhas: montadas } })
      mostrarToast('Ficha técnica salva.', { tom: 'sucesso' })
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar a ficha.')
    }
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-card border border-linha bg-cartao p-4">
        {itens.isPending && <Skeleton className="h-11" />}
        {itens.isError && <ErrorState aoTentarDeNovo={() => void itens.refetch()} />}
        {itens.isSuccess && (itens.data.length === 0 ? (
          <EmptyState
            icone={<Boxes className="size-7" aria-hidden />}
            titulo="Nenhum item no cardápio"
            descricao="Cadastre itens no cardápio primeiro: a ficha técnica descreve o que cada item consome."
          />
        ) : (
          <Field label="Item do cardápio" dica="A ficha é a lista de insumos que 1 unidade vendida deste item consome.">
            <Select
              ariaLabel="Item do cardápio"
              value={itemId}
              onChange={setItemId}
              options={opcoesItem}
            />
          </Field>
        ))}
      </div>

      {erro && <Banner tom="erro">{erro}</Banner>}

      {itemId && ficha.isPending && (
        <div aria-busy="true" aria-label="Carregando ficha" className="grid gap-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      )}

      {itemId && ficha.isError && <ErrorState aoTentarDeNovo={() => void ficha.refetch()} />}

      {itemId && ficha.isSuccess && (
        <div className="rounded-card border border-linha bg-cartao p-4">
          {linhas.length === 0 ? (
            <EmptyState
              icone={<Boxes className="size-7" aria-hidden />}
              titulo="Este item ainda não tem ficha"
              descricao="Adicione os insumos que uma unidade do item consome para dar baixa no estoque a cada venda."
              acao={
                <Button onClick={adicionarLinha}>
                  <Plus strokeWidth={1.75} className="size-4" aria-hidden />
                  Adicionar insumo
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3">
              <div className="hidden items-center gap-3 px-0.5 pb-1 sm:grid sm:grid-cols-[minmax(0,1fr)_9rem_2.75rem]">
                <span className="text-xs font-medium uppercase tracking-wide text-tinta-2">Insumo</span>
                <span className="text-right text-xs font-medium uppercase tracking-wide text-tinta-2">Quantidade</span>
                <span className="sr-only">Ações</span>
              </div>
              {linhas.map((l) => {
                const insumo = insumos.find((i) => i.id === l.insumo_id)
                const unidade = insumo?.unidade ?? ''
                return (
                  <div
                    key={l.key}
                    className="grid grid-cols-1 gap-2 rounded-input max-sm:border max-sm:border-linha max-sm:bg-papel-2/40 max-sm:p-3 sm:grid-cols-[minmax(0,1fr)_9rem_2.75rem] sm:items-center sm:gap-3"
                  >
                    <div>
                      <span className="mb-1 block text-xs font-medium text-tinta sm:hidden">Insumo</span>
                      <Select
                        ariaLabel="Insumo da ficha"
                        value={l.insumo_id}
                        onChange={(value) => alterarLinha(l.key, { insumo_id: value })}
                        options={opcoesInsumo(l.insumo_id)}
                      />
                    </div>
                    <div>
                      <span className="mb-1 block text-xs font-medium text-tinta sm:hidden">
                        {unidade ? `Quantidade (${unidade})` : 'Quantidade'}
                      </span>
                      <Input
                        aria-label={unidade ? `Quantidade em ${unidade}` : 'Quantidade'}
                        value={l.quantidade}
                        onChange={(e) => alterarLinha(l.key, { quantidade: e.target.value })}
                        inputMode="decimal"
                        placeholder="0"
                        className="text-right"
                      />
                    </div>
                    <Button
                      variante="ghost"
                      onClick={() => removerLinha(l.key)}
                      aria-label="Remover insumo da ficha"
                      className="max-sm:w-full sm:size-11 sm:px-0"
                    >
                      <Trash2 strokeWidth={1.75} className="size-4" aria-hidden />
                      <span className="sm:sr-only">Remover</span>
                    </Button>
                  </div>
                )
              })}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linha pt-3">
                <Button variante="secondary" onClick={adicionarLinha}>
                  <Plus strokeWidth={1.75} className="size-4" aria-hidden />
                  Adicionar insumo
                </Button>
                <Button loading={definir.isPending} onClick={() => void salvar()}>
                  Salvar ficha
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {!itemId && itens.isSuccess && itens.data.length > 0 && (
        <EmptyState
          icone={<Boxes className="size-7" aria-hidden />}
          titulo="Escolha um item"
          descricao="Selecione um item do cardápio acima para ver e editar os insumos que ele consome."
        />
      )}
    </div>
  )
}
