// Criar / editar grupo de opcoes (biblioteca). Nome, tipo, se e obrigatorio e o limite de escolhas.
// As opcoes do grupo sao gerenciadas na lista (nao aqui).
import { useEffect, useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Dialog, Field, Input, Select } from '@/shared/ui'
import type { TipoGrupo } from '@/shared/contracts/_generated/enums'
import type { GrupoSaida } from '@/shared/contracts/_generated/cardapio'
import { useAtualizarGrupo, useCriarGrupo } from '../api'
import { OPCOES_TIPO_GRUPO } from '../estados'

interface Props {
  aberto: boolean
  /** Grupo em edicao; null cria um novo. */
  grupo: GrupoSaida | null
  onFechar: () => void
}

/** Campo numerico: '' vira null; qualquer outro valor, inteiro >= 0. */
function numero(v: string): number | null {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null
}

export function GrupoDialog({ aberto, grupo, onFechar }: Props) {
  const criar = useCriarGrupo()
  const atualizar = useAtualizarGrupo()
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<TipoGrupo>('customizado')
  const [obrigatorio, setObrigatorio] = useState(false)
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const salvando = criar.isPending || atualizar.isPending

  useEffect(() => {
    if (!aberto) return
    setNome(grupo?.nome ?? '')
    setTipo(grupo?.tipo ?? 'customizado')
    setObrigatorio(grupo?.obrigatorio ?? false)
    setMin(grupo ? String(grupo.min_escolhas) : '')
    setMax(grupo?.max_escolhas != null ? String(grupo.max_escolhas) : '')
    setErro(null)
  }, [aberto, grupo])

  async function salvar() {
    const n = nome.trim()
    if (!n) {
      setErro('Dê um nome para o grupo.')
      return
    }
    const minEscolhas = numero(min) ?? 0
    const maxEscolhas = numero(max)
    if (maxEscolhas !== null && minEscolhas > maxEscolhas) {
      setErro('O mínimo não pode ser maior que o máximo.')
      return
    }
    setErro(null)
    const body = { nome: n, tipo, obrigatorio, min_escolhas: minEscolhas, max_escolhas: maxEscolhas }
    try {
      if (grupo) await atualizar.mutateAsync({ id: grupo.id, body })
      else await criar.mutateAsync(body)
      onFechar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar o grupo.')
    }
  }

  return (
    <Dialog
      aberto={aberto}
      onFechar={onFechar}
      titulo={grupo ? 'Editar grupo' : 'Novo grupo de opções'}
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
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Tamanho, Adicionais" maxLength={80} autoFocus />
        </Field>
        <Field label="Tipo" dica="Tamanho muda o preço base; adicional soma ao item; personalizado é livre.">
          <Select ariaLabel="Tipo do grupo" value={tipo} onChange={setTipo} options={OPCOES_TIPO_GRUPO} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Mínimo" dica="Quantas opções o cliente precisa escolher no mínimo.">
            <Input value={min} onChange={(e) => setMin(e.target.value)} inputMode="numeric" placeholder="0" />
          </Field>
          <Field label="Máximo" dica="Deixe em branco para não limitar.">
            <Input value={max} onChange={(e) => setMax(e.target.value)} inputMode="numeric" placeholder="Sem limite" />
          </Field>
        </div>
        <label className="flex items-center gap-2.5 text-sm text-tinta">
          <input
            type="checkbox"
            checked={obrigatorio}
            onChange={(e) => setObrigatorio(e.target.checked)}
            className="size-4 rounded border-linha text-salvia focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
          />
          Escolha obrigatória
        </label>
      </div>
    </Dialog>
  )
}
