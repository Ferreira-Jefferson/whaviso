// Criar / editar mesa. Nome (obrigatorio) e capacidade (lugares, opcional). Ao editar,
// tambem permite ativar/desativar (desativar = "apagar" o cadastro; o servidor nao faz DELETE).
import { useEffect, useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Dialog, Field, Input } from '@/shared/ui'
import type { MesaSaida } from '@/shared/contracts/_generated/salao'
import { useAtualizarMesa, useCriarMesa } from '../api'

interface Props {
  aberto: boolean
  /** Mesa em edicao; null cria uma nova. */
  mesa: MesaSaida | null
  onFechar: () => void
}

export function MesaDialog({ aberto, mesa, onFechar }: Props) {
  const criar = useCriarMesa()
  const atualizar = useAtualizarMesa()
  const [nome, setNome] = useState('')
  const [capacidade, setCapacidade] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const salvando = criar.isPending || atualizar.isPending

  useEffect(() => {
    if (!aberto) return
    setNome(mesa?.nome ?? '')
    setCapacidade(mesa?.capacidade != null ? String(mesa.capacidade) : '')
    setAtivo(mesa?.ativo ?? true)
    setErro(null)
  }, [aberto, mesa])

  async function salvar() {
    const n = nome.trim()
    if (!n) {
      setErro('De um nome para a mesa.')
      return
    }
    // Capacidade: so digitos; vazio = sem capacidade (null).
    const digitos = capacidade.replace(/\D/g, '')
    const cap = digitos ? Number(digitos) : null
    if (cap != null && (cap < 1 || cap > 999)) {
      setErro('A capacidade deve ficar entre 1 e 999 lugares.')
      return
    }
    setErro(null)
    try {
      if (mesa) {
        await atualizar.mutateAsync({ id: mesa.id, body: { nome: n, capacidade: cap, ativo } })
      } else {
        await criar.mutateAsync({ nome: n, capacidade: cap })
      }
      onFechar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Nao foi possivel salvar a mesa.')
    }
  }

  return (
    <Dialog
      aberto={aberto}
      onFechar={onFechar}
      titulo={mesa ? 'Editar mesa' : 'Nova mesa'}
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
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Mesa 1" maxLength={60} autoFocus />
        </Field>
        <Field label="Lugares" dica="Quantas pessoas a mesa comporta. Opcional.">
          <Input
            value={capacidade}
            onChange={(e) => setCapacidade(e.target.value.replace(/\D/g, '').slice(0, 3))}
            inputMode="numeric"
            placeholder="Ex.: 4"
          />
        </Field>
        {mesa && (
          <label className="flex items-center gap-2.5 text-sm text-tinta">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="size-4 rounded border-linha text-salvia focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
            />
            Mesa ativa (desmarque para esconder do salao)
          </label>
        )}
      </div>
    </Dialog>
  )
}
