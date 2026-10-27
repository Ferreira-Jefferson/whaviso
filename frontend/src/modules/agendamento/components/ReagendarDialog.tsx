// Define ou muda o horario de um pedido agendado. O campo e em horario de Sao Paulo; a api valida
// as regras (nao no passado, ate 30 dias, so pedido novo) e o cliente so exibe a mensagem dela.
import { useEffect, useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Dialog, Field, Input, MoneyText, useToast } from '@/shared/ui'
import type { AgendamentoDto } from '@/shared/contracts/_generated/agendamento'
import { formatarDataHora } from '@/shared/format'
import { useDefinirAgendamento } from '../api'
import { agoraComoCampo, campoParaIso, isoParaCampo, limiteCampo, ROTULO_MODALIDADE } from '../estados'

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
        {pedido && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-input border border-linha bg-papel-2 px-3 py-2.5 text-sm">
            <span className="text-tinta-2">
              {ROTULO_MODALIDADE[pedido.modalidade]} · <MoneyText centavos={pedido.total_centavos} className="text-tinta" />
            </span>
            {pedido.agendado_para && (
              <span className="text-tinta-2">
                Atual: <span className="tabular font-medium text-tinta">{formatarDataHora(pedido.agendado_para)}</span>
              </span>
            )}
          </div>
        )}
        <Field label="Novo horário" dica="Horário de Brasília. Até 30 dias a partir de agora.">
          <Input
            type="datetime-local"
            value={valor}
            min={agoraComoCampo()}
            max={limiteCampo()}
            onChange={(e) => setValor(e.target.value)}
            autoFocus
          />
        </Field>
      </div>
    </Dialog>
  )
}
