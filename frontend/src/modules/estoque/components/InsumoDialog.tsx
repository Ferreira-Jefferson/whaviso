// Criar / editar insumo (materia-prima). Nome, unidade, quantidade minima, custo unitario
// (em centavos) e, ao criar, saldo inicial. O saldo NUNCA e editado aqui: isso e via movimento
// (dialog proprio). Ao editar, tambem da para ativar/desativar o insumo.
import { useEffect, useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Dialog, Field, Input, MoneyInput, Select } from '@/shared/ui'
import type { InsumoDto } from '@/shared/contracts/_generated/estoque_insumos'
import { useAtualizarInsumo, useCriarInsumo } from '../api'
import { OPCOES_UNIDADE, parseQuantidade } from '../estados'

type Unidade = (typeof OPCOES_UNIDADE)[number]['value']

interface Props {
  aberto: boolean
  /** Insumo em edicao; null cria um novo. */
  insumo: InsumoDto | null
  onFechar: () => void
}

export function InsumoDialog({ aberto, insumo, onFechar }: Props) {
  const criar = useCriarInsumo()
  const atualizar = useAtualizarInsumo()
  const [nome, setNome] = useState('')
  const [unidade, setUnidade] = useState<Unidade>('un')
  const [minimo, setMinimo] = useState('')
  const [inicial, setInicial] = useState('')
  const [custo, setCusto] = useState<number | null>(null)
  const [ativo, setAtivo] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const salvando = criar.isPending || atualizar.isPending

  useEffect(() => {
    if (!aberto) return
    setNome(insumo?.nome ?? '')
    setUnidade((insumo?.unidade as Unidade) ?? 'un')
    setMinimo(insumo ? String(insumo.quantidade_minima).replace('.', ',') : '')
    setInicial('')
    setCusto(insumo?.custo_unitario_centavos ?? null)
    setAtivo(insumo?.ativo ?? true)
    setErro(null)
  }, [aberto, insumo])

  async function salvar() {
    const n = nome.trim()
    if (!n) {
      setErro('Dê um nome para o insumo.')
      return
    }
    const min = minimo.trim() === '' ? 0 : parseQuantidade(minimo)
    if (min === null) {
      setErro('Quantidade mínima inválida.')
      return
    }
    setErro(null)
    const custo_unitario_centavos = custo ?? null
    try {
      if (insumo) {
        await atualizar.mutateAsync({
          id: insumo.id,
          body: { nome: n, unidade, quantidade_minima: min, custo_unitario_centavos, ativo },
        })
      } else {
        const ini = inicial.trim() === '' ? 0 : parseQuantidade(inicial)
        if (ini === null) {
          setErro('Saldo inicial inválido.')
          return
        }
        await criar.mutateAsync({
          nome: n,
          unidade,
          quantidade_minima: min,
          quantidade_inicial: ini,
          custo_unitario_centavos,
        })
      }
      onFechar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar o insumo.')
    }
  }

  return (
    <Dialog
      aberto={aberto}
      onFechar={onFechar}
      titulo={insumo ? 'Editar insumo' : 'Novo insumo'}
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
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Arroz, Carne moída" maxLength={120} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Unidade">
            <Select ariaLabel="Unidade de medida" value={unidade} onChange={setUnidade} options={OPCOES_UNIDADE} />
          </Field>
          <Field label="Estoque minimo" dica="Avisamos quando o saldo ficar igual ou abaixo deste valor.">
            <Input
              value={minimo}
              onChange={(e) => setMinimo(e.target.value)}
              inputMode="decimal"
              placeholder="0"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Custo por unidade" dica="Quanto custa 1 unidade deste insumo. Opcional.">
            <MoneyInput value={custo} onChange={setCusto} />
          </Field>
          {!insumo && (
            <Field label="Saldo inicial" dica="Quanto já tem em estoque hoje. Registra uma entrada.">
              <Input
                value={inicial}
                onChange={(e) => setInicial(e.target.value)}
                inputMode="decimal"
                placeholder="0"
              />
            </Field>
          )}
        </div>
        {insumo && (
          <label className="flex items-center gap-2.5 text-sm text-tinta">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="size-4 rounded border-linha text-salvia focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
            />
            Insumo ativo
          </label>
        )}
      </div>
    </Dialog>
  )
}
