// Dialog de ajuste manual no fechamento do motoboy: bonus (soma) ou desconto (subtrai), com
// descricao obrigatoria. Lancamento e append-only: correcao = novo ajuste de sinal oposto.
// O valor e digitado positivo (MoneyInput) e o sinal vem do segmento escolhido.
import { useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Dialog, Field, Input, MoneyInput, SegmentedControl, useToast } from '@/shared/ui'
import { useLancarAjuste, type FechamentoLinha } from '../api'
import { dataBr } from '../estados'

interface Props {
  /** Linha do fechamento alvo; null = fechado. */
  linha: FechamentoLinha | null
  aoFechar: () => void
}

type Sentido = 'bonus' | 'desconto'

export function AjusteDialog({ linha, aoFechar }: Props) {
  return (
    <Dialog aberto={linha != null} onFechar={aoFechar} titulo="Lançar ajuste">
      {linha && <Formulario key={linha.id} linha={linha} aoFechar={aoFechar} />}
    </Dialog>
  )
}

function Formulario({ linha, aoFechar }: { linha: FechamentoLinha; aoFechar: () => void }) {
  const [sentido, setSentido] = useState<Sentido>('bonus')
  const [valor, setValor] = useState<number | null>(null)
  const [descricao, setDescricao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const lancar = useLancarAjuste()
  const { mostrarToast } = useToast()

  function enviar() {
    const texto = descricao.trim()
    if (valor == null || valor <= 0) return setErro('Informe um valor maior que zero.')
    if (texto.length === 0) return setErro('Descreva o motivo do ajuste.')
    setErro(null)
    lancar.mutate(
      {
        motoboyId: linha.motoboy_id,
        valor_centavos: sentido === 'bonus' ? valor : -valor,
        descricao: texto,
        data: linha.data,
      },
      {
        onSuccess: () => {
          mostrarToast('Ajuste lançado.', { tom: 'sucesso' })
          aoFechar()
        },
        onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível lançar o ajuste.'),
      },
    )
  }

  return (
    <form
      className="flex flex-col gap-4 text-left"
      onSubmit={(e) => {
        e.preventDefault()
        enviar()
      }}
    >
      <p className="text-sm text-tinta-2">
        {linha.motoboy_nome}, dia {dataBr(linha.data)}. O ajuste não pode ser editado depois: para corrigir, lance outro de sinal oposto.
      </p>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-tinta">Tipo do ajuste</span>
        <SegmentedControl<Sentido>
          ariaLabel="Tipo do ajuste"
          value={sentido}
          onChange={setSentido}
          options={[
            { value: 'bonus', label: 'Bônus (soma)' },
            { value: 'desconto', label: 'Desconto (subtrai)' },
          ]}
        />
      </div>
      <Field label="Valor">
        <MoneyInput value={valor} onChange={setValor} autoFocus />
      </Field>
      <Field label="Motivo">
        <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={200} placeholder="Ex.: bônus de chuva" autoComplete="off" />
      </Field>
      {erro && <Banner tom="erro">{erro}</Banner>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={lancar.isPending}>
          Lançar ajuste
        </Button>
        <Button type="button" variante="secondary" disabled={lancar.isPending} onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
