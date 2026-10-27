// Define ou muda o horario de um pedido agendado. O campo e em horario de Sao Paulo; a api valida
// as regras (nao no passado, ate 30 dias, so pedido novo) e o cliente so exibe a mensagem dela.
import { useEffect, useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Dialog, Field, Input, useToast } from '@/shared/ui'
import type { AgendamentoDto } from '@/shared/contracts/_generated/agendamento'
import { useDefinirAgendamento } from '../api'
import { agoraComoCampo, campoParaIso, isoParaCampo } from '../estados'

interface Props {
  pedido: AgendamentoDto | null
  onFechar: () => void
}

export function ReagendarDialog({ pedido, onFechar }: Props) {
  const definir = useDefinirAgendamento()
  const { mostrarToast } = useToast()
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!pedido) return
    setValor(pedido.agendado_para ? isoParaCampo(pedido.agendado_para) : '')
    setErro(null)
  }, [pedido])

  async function salvar() {
    if (!pedido) return
    if (!valor) {
      setErro('Escolha a data e a hora.')
      return
    }
    setErro(null)
    try {
      await definir.mutateAsync({ pedidoId: pedido.pedido_id, body: { agendado_para: campoParaIso(valor) } })
      mostrarToast('Horário atualizado.', { tom: 'sucesso' })
      onFechar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar o horário.')
    }
  }

  return (
    <Dialog
      aberto={pedido !== null}
      onFechar={onFechar}
      titulo={pedido ? `Reagendar pedido ${pedido.codigo}` : 'Reagendar pedido'}
      acoes={
        <>
          <Button className="w-full" loading={definir.isPending} onClick={() => void salvar()}>
            Salvar
          </Button>
          <Button variante="secondary" className="w-full" disabled={definir.isPending} onClick={onFechar}>
            Cancelar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erro && <Banner tom="erro">{erro}</Banner>}
        <Field label="Data e hora" dica="Horário de Brasília. Até 30 dias a partir de agora.">
          <Input
            type="datetime-local"
            value={valor}
            min={agoraComoCampo()}
            onChange={(e) => setValor(e.target.value)}
            autoFocus
          />
        </Field>
      </div>
    </Dialog>
  )
}
