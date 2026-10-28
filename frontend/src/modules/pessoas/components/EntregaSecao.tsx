// Secao "Entrega" do cadastro da pessoa, visivel so quando o cargo e Motoboy: veiculo, placa, Pix
// (com o atual mascarado + trocar/remover, como no cadastro de entrega) e regime de pagamento.
// Componente controlado: estado e salvamento ficam no PessoaDialog. PII: o Pix so aparece mascarado
// (ultimos 4); para trocar, digita-se uma chave nova. Dinheiro em centavos (MoneyInput).
import { Lock } from 'lucide-react'
import { Field, Input, MoneyInput, Select } from '@/shared/ui'
import type {
  PeriodicidadeFixo,
  RegimePagamento,
  TipoChavePix,
  TipoVeiculo,
} from '@/shared/contracts/_generated/enums'
import type { Entrega } from '../api'
import {
  PERIODICIDADES,
  PLACEHOLDER_PIX,
  REGIMES,
  ROTULO_PERIODICIDADE,
  ROTULO_PIX,
  ROTULO_REGIME,
  ROTULO_VEICULO,
  TIPOS_PIX,
  VEICULOS,
  type EntregaForm,
} from '../estados'

const OPCOES_VEICULO = VEICULOS.map((v) => ({ value: v, label: ROTULO_VEICULO[v] }))
const OPCOES_PIX = TIPOS_PIX.map((t) => ({ value: t, label: ROTULO_PIX[t] }))
const OPCOES_REGIME = REGIMES.map((r) => ({ value: r, label: ROTULO_REGIME[r] }))
const OPCOES_PERIODICIDADE = PERIODICIDADES.map((p) => ({ value: p, label: ROTULO_PERIODICIDADE[p] }))

interface Props {
  valor: EntregaForm
  aoMudar: (patch: Partial<EntregaForm>) => void
  entregaAtual: Entrega | null
  ehEdicao: boolean
}

export function EntregaSecao({ valor, aoMudar, entregaAtual, ehEdicao }: Props) {
  const temParcelaFixa = valor.regime !== 'por_entrega'
  return (
    <div className="flex flex-col gap-4">
      <span className="text-sm font-semibold text-tinta">Entrega</span>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Veículo">
          <Select
            ariaLabel="Veículo"
            value={valor.veiculo}
            onChange={(v: TipoVeiculo) => aoMudar({ veiculo: v })}
            options={OPCOES_VEICULO}
          />
        </Field>
        <Field label="Placa">
          <Input
            value={valor.placa}
            onChange={(e) => aoMudar({ placa: e.target.value.toUpperCase() })}
            maxLength={12}
            placeholder="ABC1D23"
            autoComplete="off"
          />
        </Field>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium text-tinta">Chave Pix para o pagamento</span>
        {ehEdicao && (
          <div className="flex items-center gap-2 text-xs text-tinta-2">
            <Lock className="size-3.5 flex-none" aria-hidden />
            {valor.removerPix ? (
              <span>O Pix será removido ao salvar.</span>
            ) : entregaAtual?.pix_ultimos4 ? (
              <>
                <span className="tabular">
                  Atual: {entregaAtual.pix_tipo ? ROTULO_PIX[entregaAtual.pix_tipo] : 'Pix'} final{' '}
                  {entregaAtual.pix_ultimos4}
                </span>
                <button
                  type="button"
                  onClick={() => aoMudar({ removerPix: true, pix: '' })}
                  className="font-medium text-barro underline underline-offset-2 hover:opacity-80"
                >
                  Remover
                </button>
              </>
            ) : (
              <span>Nenhum Pix cadastrado.</span>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_1fr]">
          <Field label="Tipo da chave">
            <Select
              ariaLabel="Tipo da chave Pix"
              value={valor.pixTipo}
              onChange={(t: TipoChavePix) => aoMudar({ pixTipo: t })}
              options={OPCOES_PIX}
            />
          </Field>
          <Field
            label={ehEdicao ? 'Nova chave Pix' : 'Chave Pix'}
            dica={ehEdicao ? 'Deixe em branco para manter a chave atual.' : undefined}
          >
            <Input
              value={valor.pix}
              onChange={(e) => aoMudar({ pix: e.target.value, ...(e.target.value ? { removerPix: false } : {}) })}
              maxLength={140}
              placeholder={PLACEHOLDER_PIX[valor.pixTipo]}
              autoComplete="off"
            />
          </Field>
        </div>
      </div>

      <Field label="Regime de pagamento" dica="Como a loja paga este motoboy.">
        <Select
          ariaLabel="Regime de pagamento"
          value={valor.regime}
          onChange={(r: RegimePagamento) => aoMudar({ regime: r })}
          options={OPCOES_REGIME}
        />
      </Field>

      {temParcelaFixa && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Periodicidade">
            <Select
              ariaLabel="Periodicidade"
              value={valor.periodicidade}
              onChange={(p: PeriodicidadeFixo) => aoMudar({ periodicidade: p })}
              options={OPCOES_PERIODICIDADE}
            />
          </Field>
          <Field label="Valor fixo">
            <MoneyInput value={valor.valorFixo} onChange={(c) => aoMudar({ valorFixo: c })} />
          </Field>
        </div>
      )}
    </div>
  )
}
