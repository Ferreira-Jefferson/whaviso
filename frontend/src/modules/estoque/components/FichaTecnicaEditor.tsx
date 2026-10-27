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
      setErro('Ha insumo repetido na ficha. Deixe cada insumo uma vez so.')
      return
    }
    setErro(null)
    try {
      await definir.mutateAsync({ itemId, body: { linhas: montadas } })
      mostrarToast('Ficha tecnica salva.', { tom: 'sucesso' })
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Nao foi possivel salvar a ficha.')
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
            titulo="Nenhum item no cardapio"
            descricao="Cadastre itens no cardapio primeiro: a ficha tecnica descreve o que cada item consome."
          />
        ) : (
          <Field label="Item do cardapio" dica="A ficha e a lista de insumos que 1 unidade vendida deste item consome.">
            <Select
              ariaLabel="Item do cardapio"
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
              titulo="Este item ainda nao tem ficha"
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
              {linhas.map((l) => {
                const insumo = insumos.find((i) => i.id === l.insumo_id)
                const unidade = insumo?.unidade ?? ''
                return (
                  <div key={l.key} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <Field label="Insumo">
                        <Select
                          ariaLabel="Insumo da ficha"
                          value={l.insumo_id}
                          onChange={(value) => alterarLinha(l.key, { insumo_id: value })}
                          options={opcoesInsumo(l.insumo_id)}
                        />
                      </Field>
                    </div>
                    <div className="sm:w-40">
                      <Field label={unidade ? `Quantidade (${unidade})` : 'Quantidade'}>
                        <Input
                          value={l.quantidade}
                          onChange={(e) => alterarLinha(l.key, { quantidade: e.target.value })}
                          inputMode="decimal"
                          placeholder="0"
                        />
                      </Field>
                    </div>
                    <Button
                      variante="ghost"
                      onClick={() => removerLinha(l.key)}
                      aria-label="Remover insumo da ficha"
                      className="max-sm:w-full"
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
          descricao="Selecione um item do cardapio acima para ver e editar os insumos que ele consome."
        />
      )}
    </div>
  )
}
