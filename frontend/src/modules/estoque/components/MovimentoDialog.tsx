// Registrar movimento de um insumo: entrada (soma), saida (subtrai) ou ajuste (define o saldo).
// Mostra o saldo atual e os ultimos movimentos para dar contexto. O insumo_id vai no corpo
// (validado contra a loja no servidor). Quantidade e decimal, nunca dinheiro.
import { useEffect, useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { Badge, Banner, Button, Dialog, Field, Input, SegmentedControl } from '@/shared/ui'
import { dataHoraPtBR } from '@/shared/format'
import type { InsumoDto } from '@/shared/contracts/_generated/estoque_insumos'
import { useMovimentarInsumo, useMovimentosInsumo } from '../api'
import {
  DICA_TIPO_MOVIMENTO,
  OPCOES_TIPO_MOVIMENTO,
  ROTULO_TIPO_MOVIMENTO,
  formatarQuantidade,
  parseQuantidade,
  saldoComUnidade,
} from '../estados'

type Tipo = (typeof OPCOES_TIPO_MOVIMENTO)[number]['value']

interface Props {
  aberto: boolean
  insumo: InsumoDto | null
  onFechar: () => void
}

export function MovimentoDialog({ aberto, insumo, onFechar }: Props) {
  const movimentar = useMovimentarInsumo()
  const historico = useMovimentosInsumo(aberto ? (insumo?.id ?? null) : null)
  const [tipo, setTipo] = useState<Tipo>('entrada')
  const [quantidade, setQuantidade] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    setTipo('entrada')
    setQuantidade('')
    setMotivo('')
    setErro(null)
  }, [aberto, insumo])

  async function salvar() {
    if (!insumo) return
    const q = parseQuantidade(quantidade)
    if (q === null) {
      setErro('Informe uma quantidade valida.')
      return
    }
    if (tipo !== 'ajuste' && q <= 0) {
      setErro('A quantidade precisa ser maior que zero.')
      return
    }
    setErro(null)
    try {
      await movimentar.mutateAsync({
        insumo_id: insumo.id,
        tipo,
        quantidade: q,
        motivo: motivo.trim() || undefined,
      })
      onFechar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Nao foi possivel registrar o movimento.')
    }
  }

  const unidade = insumo?.unidade ?? ''

  return (
    <Dialog
      aberto={aberto}
      onFechar={onFechar}
      titulo="Registrar movimento"
      className="max-w-md"
      acoes={
        <>
          <Button className="w-full" loading={movimentar.isPending} onClick={() => void salvar()}>
            Salvar movimento
          </Button>
          <Button variante="secondary" className="w-full" disabled={movimentar.isPending} onClick={onFechar}>
            Cancelar
          </Button>
        </>
      }
    >
      {insumo && (
        <div className="flex flex-col gap-4">
          {erro && <Banner tom="erro">{erro}</Banner>}

          <div className="flex items-center justify-between rounded-input border border-linha bg-papel-2 px-3 py-2.5">
            <span className="truncate font-medium text-tinta">{insumo.nome}</span>
            <span className="tabular text-sm text-tinta-2">
              Saldo: {saldoComUnidade(insumo.quantidade_atual, unidade)}
            </span>
          </div>

          <Field label="Tipo de movimento" dica={DICA_TIPO_MOVIMENTO[tipo]}>
            <SegmentedControl
              ariaLabel="Tipo de movimento"
              value={tipo}
              onChange={setTipo}
              options={OPCOES_TIPO_MOVIMENTO}
            />
          </Field>

          <Field label={tipo === 'ajuste' ? `Novo saldo (${unidade})` : `Quantidade (${unidade})`}>
            <Input
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              autoFocus
            />
          </Field>

          <Field label="Motivo" dica="Anotacao opcional (ex.: compra, quebra, recontagem).">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Opcional" maxLength={200} />
          </Field>

          {historico.isSuccess && historico.data.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-tinta-2">Ultimos movimentos</p>
              <ul className="flex flex-col gap-1.5">
                {historico.data.slice(0, 5).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                    <Badge tom={m.tipo === 'entrada' ? 'sucesso' : m.tipo === 'saida' ? 'atencao' : 'neutro'}>
                      {ROTULO_TIPO_MOVIMENTO[m.tipo]}
                    </Badge>
                    <span className="tabular text-tinta">{formatarQuantidade(m.quantidade)}</span>
                    <span className="min-w-0 flex-1 truncate text-right text-xs text-tinta-2">
                      {dataHoraPtBR(m.criado_em)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}
