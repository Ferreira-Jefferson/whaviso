// Configuracao do programa de fidelidade: ativo, modo (pontos ou cashback) e parametros do modo.
// Os numeros da regra sao do backend; o "exemplo" abaixo so ilustra a formula documentada
// (floor, subtotal pago) e nao e fonte de verdade.
import { useEffect, useState } from 'react'
import { ArrowRight, Gift } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { brl, formatarDataHora } from '@/shared/format'
import { Badge, Banner, Button, Card, Field, Input, MoneyInput, SegmentedControl, cn, useToast } from '@/shared/ui'
import { ProgramaEntrada } from '@/shared/contracts/_generated/fidelidade'
import { useSalvarPrograma, type ModoFidelidadeTipo, type Programa, type ProgramaForm as Valores } from '../api'
import { Alternador } from './Alternador'
import { PercentInput } from './PercentInput'

type Chave = keyof Valores
type Erros = Partial<Record<Chave, string>>

const CAMPOS: ReadonlyArray<Chave> = [
  'cashback_bps',
  'pontos_por_real',
  'valor_ponto_centavos',
  'minimo_resgate',
  'max_resgate_bps',
]

const MENSAGENS_ERRO: Record<string, string> = {
  modo_travado: 'O modo não pode mais ser trocado: já existem movimentos de saldo nesta loja.',
}

function deConfig(p: Programa): Valores {
  return {
    ativo: p.ativo,
    modo: p.modo,
    cashback_bps: p.cashback_bps,
    pontos_por_real: p.pontos_por_real,
    valor_ponto_centavos: p.valor_ponto_centavos,
    minimo_resgate: p.minimo_resgate,
    max_resgate_bps: p.max_resgate_bps,
  }
}

export function ProgramaForm({ programa }: { programa: Programa }) {
  const [v, setV] = useState<Valores>(() => deConfig(programa))
  const [erros, setErros] = useState<Erros>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const salvar = useSalvarPrograma()
  const { mostrarToast } = useToast()

  useEffect(() => {
    setV(deConfig(programa))
  }, [programa])

  const set = <K extends Chave>(k: K, valor: Valores[K]) => setV((x) => ({ ...x, [k]: valor }))
  const cashback = v.modo === 'cashback'

  const enviar = () => {
    setErroGeral(null)
    const r = ProgramaEntrada.safeParse(v)
    if (!r.success) {
      const e: Erros = {}
      for (const i of r.error.issues) {
        const k = i.path[0]
        if (typeof k === 'string' && (CAMPOS as readonly string[]).includes(k) && !e[k as Chave]) {
          e[k as Chave] = mensagem(k as Chave)
        }
      }
      setErros(e)
      return
    }
    setErros({})
    salvar.mutate(r.data, {
      onSuccess: () => mostrarToast('Programa de fidelidade salvo.', { tom: 'sucesso' }),
      onError: (err) =>
        setErroGeral(err instanceof ApiError ? (MENSAGENS_ERRO[err.code] ?? err.message) : 'Não foi possível salvar o programa.'),
    })
  }

  const exemploBase = 5000
  const ganho = cashback
    ? Math.floor((exemploBase * v.cashback_bps) / 10000)
    : Math.floor((exemploBase * v.pontos_por_real) / 100)

  return (
    <form
      className="flex max-w-2xl flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        enviar()
      }}
    >
      {!programa.configurado && (
        <Banner tom="info">
          Você ainda não configurou o programa. Os valores abaixo são sugestões e ele começa desligado.
        </Banner>
      )}

      <Card className="flex items-center gap-4">
        <span
          aria-hidden
          className={cn(
            'flex size-10 flex-none items-center justify-center rounded-pill transition-colors',
            v.ativo ? 'bg-salvia-claro text-salvia' : 'bg-papel-2 text-tinta-2',
          )}
        >
          <Gift strokeWidth={1.75} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-tinta">Programa de fidelidade</p>
            <Badge tom={v.ativo ? 'sucesso' : 'neutro'}>{v.ativo ? 'Ligado' : 'Desligado'}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-tinta-2">
            {v.ativo ? 'Clientes acumulam e podem resgatar.' : 'Ninguém acumula nem resgata enquanto estiver desligado.'}
          </p>
        </div>
        <Alternador ligado={v.ativo} onMudar={(l) => set('ativo', l)} rotulo="Programa ligado" />
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span id="modo-rotulo" className="text-sm font-medium text-tinta">
            Como o cliente ganha
          </span>
          <SegmentedControl<ModoFidelidadeTipo>
            ariaLabel="Modo do programa"
            preencher
            value={v.modo}
            onChange={(m) => set('modo', m)}
            options={[
              { value: 'cashback', label: 'Cashback' },
              { value: 'pontos', label: 'Pontos' },
            ]}
          />
          <p className="text-xs text-tinta-2">
            Depois do primeiro movimento de saldo da loja o modo fica travado, porque a unidade do saldo mudaria.
          </p>
        </div>

        {cashback ? (
          <Field label="Cashback sobre o subtotal pago" erro={erros.cashback_bps} dica="Percentual do subtotal (sem entrega) devolvido como crédito.">
            <PercentInput bps={v.cashback_bps} onChange={(b) => set('cashback_bps', b)} />
          </Field>
        ) : (
          <>
            <Field label="Pontos por R$ 1,00 pago" erro={erros.pontos_por_real} dica="Pontos ganhos a cada real do subtotal pago.">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                value={v.pontos_por_real}
                onChange={(e) => set('pontos_por_real', Math.trunc(Number(e.target.value)))}
              />
            </Field>
            <Field label="Valor de 1 ponto no resgate" erro={erros.valor_ponto_centavos}>
              <MoneyInput value={v.valor_ponto_centavos} onChange={(c) => set('valor_ponto_centavos', c ?? 0)} />
            </Field>
          </>
        )}

        <Field
          label={cashback ? 'Resgate mínimo' : 'Resgate mínimo (em pontos)'}
          erro={erros.minimo_resgate}
          dica="Menor valor que o cliente pode resgatar de uma vez. Zero libera qualquer valor."
        >
          {cashback ? (
            <MoneyInput value={v.minimo_resgate} onChange={(c) => set('minimo_resgate', c ?? 0)} />
          ) : (
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={v.minimo_resgate}
              onChange={(e) => set('minimo_resgate', Math.max(0, Math.trunc(Number(e.target.value))))}
            />
          )}
        </Field>

        <Field label="Teto do resgate por pedido" erro={erros.max_resgate_bps} dica="Percentual máximo do subtotal do pedido que pode ser pago com saldo.">
          <PercentInput bps={v.max_resgate_bps} onChange={(b) => set('max_resgate_bps', b)} />
        </Field>

        <div className="rounded-input border border-linha bg-papel-2 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-tinta-2">Prévia do ganho</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm text-tinta-2">
              Pedido de <strong className="tabular text-tinta">{brl(exemploBase)}</strong>
            </span>
            <ArrowRight strokeWidth={1.75} className="size-4 flex-none text-tinta-2" aria-hidden />
            <span className="font-display text-xl font-semibold text-salvia">
              {cashback ? `${brl(ganho)} de crédito` : `${ganho} ${ganho === 1 ? 'ponto' : 'pontos'}`}
            </span>
          </div>
          {!cashback && (
            <p className="mt-1 text-xs text-tinta-2">Valem {brl(ganho * v.valor_ponto_centavos)} no resgate.</p>
          )}
        </div>
      </Card>

      {erroGeral && (
        <p role="alert" className="text-sm text-barro">
          {erroGeral}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={salvar.isPending}>
          Salvar programa
        </Button>
        {programa.atualizado_em && (
          <span className="text-xs text-tinta-2">Atualizado em {formatarDataHora(programa.atualizado_em)}</span>
        )}
      </div>
    </form>
  )
}

function mensagem(k: Chave): string {
  switch (k) {
    case 'cashback_bps':
      return 'Informe um percentual de 0 a 100.'
    case 'pontos_por_real':
      return 'Informe de 1 a 1000 pontos por real.'
    case 'valor_ponto_centavos':
      return 'O ponto deve valer de R$ 0,01 a R$ 100,00.'
    case 'max_resgate_bps':
      return 'Informe um percentual de 0,01 a 100.'
    default:
      return 'Valor inválido.'
  }
}
