// Conclui um follow-up. Atividade e imutavel: concluir = registrar uma NOVA atividade que referencia
// o follow-up. O tipo diz como foi feito (nota exige texto, como no servidor).
import { useState } from 'react'
import { Banner, Button, Dialog, Field, Select, useToast } from '@/shared/ui'
import type { TipoAtividadeProspecto } from '@/shared/contracts/_generated/enums'
import { useCriarAtividade } from '../api'
import { ROTULO_ATIVIDADE, TIPOS_CONCLUSAO } from '../rotulos'
import { mensagemDeErro } from '../erros'

export interface AlvoConclusao {
  prospectoId: string
  atividadeId: number
  nomeRestaurante: string
}

export function ConcluirFollowUpDialog({ alvo, aoFechar }: { alvo: AlvoConclusao | null; aoFechar: () => void }) {
  return (
    <Dialog aberto={alvo != null} onFechar={aoFechar} titulo="Concluir follow-up" className="max-w-md">
      {alvo && <Formulario key={alvo.atividadeId} alvo={alvo} aoFechar={aoFechar} />}
    </Dialog>
  )
}

function Formulario({ alvo, aoFechar }: { alvo: AlvoConclusao; aoFechar: () => void }) {
  const [tipo, setTipo] = useState<Exclude<TipoAtividadeProspecto, 'follow_up'>>('ligacao')
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const criar = useCriarAtividade()
  const { mostrarToast } = useToast()

  const salvar = () => {
    const descricao = texto.trim()
    if (tipo === 'nota' && !descricao) return setErro('Conte o que aconteceu para registrar a nota.')
    setErro(null)
    criar.mutate(
      {
        prospectoId: alvo.prospectoId,
        body: { tipo, conclui_atividade_id: alvo.atividadeId, ...(descricao ? { descricao } : {}) },
      },
      {
        onSuccess: () => {
          mostrarToast('Follow-up concluído.', { tom: 'sucesso' })
          aoFechar()
        },
        onError: (e) => setErro(mensagemDeErro(e, 'Não foi possível concluir.')),
      },
    )
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        salvar()
      }}
    >
      <p>{alvo.nomeRestaurante}</p>
      <Field label="Como foi">
        <Select
          ariaLabel="Como foi"
          value={tipo}
          onChange={setTipo}
          options={TIPOS_CONCLUSAO.map((t) => ({ value: t, label: ROTULO_ATIVIDADE[t] }))}
        />
      </Field>
      <Field label="O que aconteceu">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          maxLength={2000}
          className="w-full rounded-input border border-linha bg-cartao px-3 py-2.5 text-sm text-tinta focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
        />
      </Field>
      {erro && <Banner tom="erro">{erro}</Banner>}
      <div className="flex flex-col gap-2">
        <Button type="submit" loading={criar.isPending}>
          Concluir
        </Button>
        <Button type="button" variante="secondary" disabled={criar.isPending} onClick={aoFechar}>
          Voltar
        </Button>
      </div>
    </form>
  )
}
