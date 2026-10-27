// Importacao rapida: varios bairros com os mesmos valores (transacional: tudo ou nada).
import { useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Dialog, Field, MoneyInput, useToast } from '@/shared/ui'
import { useCriarZonasEmLote } from '../api'

interface Props {
  aberto: boolean
  aoFechar: () => void
}

export function LoteDialog({ aberto, aoFechar }: Props) {
  return (
    <Dialog aberto={aberto} onFechar={aoFechar} titulo="Importar bairros" className="max-w-lg">
      {aberto && <Formulario aoFechar={aoFechar} />}
    </Dialog>
  )
}

function Formulario({ aoFechar }: { aoFechar: () => void }) {
  const [texto, setTexto] = useState('')
  const [taxa, setTaxa] = useState<number | null>(null)
  const [valorMotoboy, setValorMotoboy] = useState<number | null>(null)
  const [minimo, setMinimo] = useState<number | null>(null)
  const [freteGratis, setFreteGratis] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const lote = useCriarZonasEmLote()
  const { mostrarToast } = useToast()

  // Um bairro por linha (ou separados por virgula/ponto e virgula); repetidos sao ignorados.
  const bairros = [...new Set(texto.split(/[\n,;]+/).map((b) => b.trim()).filter((b) => b.length > 0))]

  function enviar() {
    if (bairros.length === 0) return setErro('Informe ao menos um bairro.')
    if (bairros.length > 200) return setErro('No máximo 200 bairros por vez.')
    if (taxa == null || valorMotoboy == null) return setErro('Informe a taxa do cliente e o valor do motoboy.')
    setErro(null)
    lote.mutate(
      {
        bairros,
        taxa_cliente_centavos: taxa,
        valor_motoboy_centavos: valorMotoboy,
        pedido_minimo_centavos: minimo,
        frete_gratis_acima_centavos: freteGratis,
      },
      {
        onSuccess: () => {
          mostrarToast(bairros.length === 1 ? '1 zona criada.' : `${bairros.length} zonas criadas.`, { tom: 'sucesso' })
          aoFechar()
        },
        onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível importar os bairros.'),
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
      <Field label="Bairros" dica="Um por linha, ou separados por vírgula. Cada bairro vira uma zona com os mesmos valores.">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={6}
          placeholder={'Centro\nVila Madalena\nPinheiros'}
          className="w-full resize-y rounded-input border border-linha bg-cartao px-3 py-2.5 text-sm text-tinta placeholder:text-tinta-2/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
        />
      </Field>
      <p className="-mt-2 text-xs text-tinta-2">
        {bairros.length === 0
          ? 'Nenhum bairro informado.'
          : `${bairros.length} ${bairros.length === 1 ? 'bairro' : 'bairros'} para criar.`}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Taxa cobrada do cliente">
          <MoneyInput value={taxa} onChange={setTaxa} />
        </Field>
        <Field label="Valor pago ao motoboy">
          <MoneyInput value={valorMotoboy} onChange={setValorMotoboy} />
        </Field>
        <Field label="Pedido mínimo (opcional)">
          <MoneyInput value={minimo} onChange={setMinimo} />
        </Field>
        <Field label="Frete grátis acima de (opcional)">
          <MoneyInput value={freteGratis} onChange={setFreteGratis} />
        </Field>
      </div>
      {erro && <Banner tom="erro">{erro}</Banner>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={lote.isPending}>
          Importar
        </Button>
        <Button type="button" variante="secondary" disabled={lote.isPending} onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
