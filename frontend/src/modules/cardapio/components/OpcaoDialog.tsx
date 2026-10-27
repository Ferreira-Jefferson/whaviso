// Criar / editar opcao de um grupo. Nome, preco (centavos) e se vem marcada por padrao.
// A disponibilidade (ligar/desligar) tem fluxo proprio na lista.
import { useEffect, useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Dialog, Field, Input, MoneyInput } from '@/shared/ui'
import type { OpcaoSaida } from '@/shared/contracts/_generated/cardapio'
import { useAtualizarOpcao, useCriarOpcao } from '../api'

interface Props {
  aberto: boolean
  /** Opcao em edicao; null cria uma nova. */
  opcao: OpcaoSaida | null
  /** Grupo ao qual a nova opcao pertence. */
  grupoId: string
  onFechar: () => void
}

export function OpcaoDialog({ aberto, opcao, grupoId, onFechar }: Props) {
  const criar = useCriarOpcao()
  const atualizar = useAtualizarOpcao()
  const [nome, setNome] = useState('')
  const [preco, setPreco] = useState<number | null>(0)
  const [padrao, setPadrao] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const salvando = criar.isPending || atualizar.isPending

  useEffect(() => {
    if (!aberto) return
    setNome(opcao?.nome ?? '')
    setPreco(opcao?.preco_centavos ?? 0)
    setPadrao(opcao?.padrao ?? false)
    setErro(null)
  }, [aberto, opcao])

  async function salvar() {
    const n = nome.trim()
    if (!n) {
      setErro('Dê um nome para a opção.')
      return
    }
    setErro(null)
    const preco_centavos = preco ?? 0
    try {
      if (opcao) await atualizar.mutateAsync({ id: opcao.id, body: { nome: n, preco_centavos, padrao } })
      else await criar.mutateAsync({ grupoId, body: { nome: n, preco_centavos, padrao } })
      onFechar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar a opção.')
    }
  }

  return (
    <Dialog
      aberto={aberto}
      onFechar={onFechar}
      titulo={opcao ? 'Editar opção' : 'Nova opção'}
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
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Borda recheada" maxLength={80} autoFocus />
        </Field>
        <Field label="Preço" dica="Quanto esta opção soma ao item. Deixe zerado se não cobra a mais.">
          <MoneyInput value={preco} onChange={setPreco} />
        </Field>
        <label className="flex items-center gap-2.5 text-sm text-tinta">
          <input
            type="checkbox"
            checked={padrao}
            onChange={(e) => setPadrao(e.target.checked)}
            className="size-4 rounded border-linha text-salvia focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
          />
          Vem marcada por padrão
        </label>
      </div>
    </Dialog>
  )
}
