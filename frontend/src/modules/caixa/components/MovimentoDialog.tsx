// Dialog de movimento do caixa: venda, sangria ou suprimento (um por vez, pelo `tipo`).
// - venda:       valor + forma de pagamento (dinheiro/credito/debito/pix/outro) + observacao.
// - sangria:     valor retirado da gaveta + observacao.
// - suprimento:  valor adicionado a gaveta + observacao.
// Valor sempre positivo e em CENTAVOS (MoneyInput). O `ajuste` nao entra aqui (nasce do fechamento).
import { useEffect, useState } from 'react'
import { Banner, Button, Dialog, Field, Input, MoneyInput, SegmentedControl } from '@/shared/ui'
import type { FormaPagamento } from '@/shared/contracts/_generated/caixa'
import type { MovimentoEntrada } from '@/shared/contracts/_generated/caixa'
import { CONFIG_MOVIMENTO, FORMAS_PAGAMENTO, ROTULO_FORMA, type TipoMovimentoManual } from '../estados'

interface MovimentoDialogProps {
  aberto: boolean
  tipo: TipoMovimentoManual
  carregando: boolean
  erro: string | null
  onConfirmar: (entrada: MovimentoEntrada) => void
  onFechar: () => void
}

const OPCOES_FORMA = FORMAS_PAGAMENTO.map((forma) => ({ value: forma, label: ROTULO_FORMA[forma] }))

export function MovimentoDialog({ aberto, tipo, carregando, erro, onConfirmar, onFechar }: MovimentoDialogProps) {
  const cfg = CONFIG_MOVIMENTO[tipo]
  const [valor, setValor] = useState<number | null>(null)
  const [forma, setForma] = useState<FormaPagamento>('dinheiro')
  const [motivo, setMotivo] = useState('')

  // Limpa o formulario a cada abertura (e a cada troca de tipo).
  useEffect(() => {
    if (aberto) {
      setValor(null)
      setForma('dinheiro')
      setMotivo('')
    }
  }, [aberto, tipo])

  const podeEnviar = valor != null && valor > 0 && !carregando

  function enviar() {
    if (!podeEnviar) return
    const motivoLimpo = motivo.trim()
    onConfirmar({
      tipo,
      valor_centavos: valor,
      forma_pagamento: cfg.comForma ? forma : undefined,
      motivo: motivoLimpo.length > 0 ? motivoLimpo : undefined,
    })
  }

  return (
    <Dialog
      aberto={aberto}
      onFechar={carregando ? () => {} : onFechar}
      titulo={cfg.titulo}
      acoes={
        <>
          <Button variante="primary" className="w-full" loading={carregando} disabled={!podeEnviar} onClick={enviar}>
            {cfg.confirmar}
          </Button>
          <Button variante="secondary" className="w-full" disabled={carregando} onClick={onFechar}>
            Cancelar
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault()
          enviar()
        }}
      >
        <p className="text-sm text-tinta-2">{cfg.descricao}</p>

        <Field label={cfg.rotuloValor}>
          <MoneyInput value={valor} onChange={setValor} autoFocus />
        </Field>

        {cfg.comForma && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-tinta">Forma de pagamento</span>
            <SegmentedControl
              value={forma}
              onChange={setForma}
              options={OPCOES_FORMA}
              ariaLabel="Forma de pagamento da venda"
              preencher
            />
          </div>
        )}

        <Field label="Observação (opcional)" dica="Anotação curta sobre este movimento. Ajuda a conferir o caixa depois.">
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={tipo === 'venda' ? 'Ex.: pedido do balcão' : 'Ex.: troca de troco'}
            maxLength={300}
            autoComplete="off"
          />
        </Field>

        {erro && <Banner tom="erro">{erro}</Banner>}

        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  )
}
