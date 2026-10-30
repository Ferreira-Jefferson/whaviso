// Comparador de custo da landing: o visitante informa ticket medio, pedidos/mes,
// escolhe a plataforma e liga/desliga as camadas de taxa (entrega pela plataforma,
// pagamento no app); mostramos o custo mensal dela contra os cenarios do whaviso.
//
// Dinheiro SEMPRE em centavos (int); conversao so via MoneyInput/brl (convencao do
// repo). As taxas das plataformas sao as de 2026 (ver notas por plataforma). Os valores
// do Asaas sao os REAIS, sem promocao (a promo acaba, o preco real permanece).
import { useState } from 'react'
import { MoneyInput, Select, SegmentedControl, Switch, type SelectOption } from '@/shared/ui'
import { brl } from '@/shared/format'
import { usePlanosPublicos } from '../planos'

// --- Custos do whaviso ---
// A taxa de intermediacao vem do PLANO escolhido (0,50/0,40/0,30); estes sao os custos do PSP.
const ASAAS_PIX_CENTAVOS = 199 // Asaas: Pix recebido, preco real pos-promocao
const ASAAS_CARTAO_FIXO_CENTAVOS = 49 // Asaas: fixo por cobranca no credito
const ASAAS_CARTAO_PCT = 0.0299 // Asaas: credito a vista (preco real)
// Fallback enquanto os planos nao carregaram (ou nenhum ativo): mantem o comparador funcional.
const FALLBACK_MENS_CENTAVOS = 14900
const FALLBACK_TAXA_CENTAVOS = 50

type PlatKey = 'ifood' | '99food' | 'aiqfome' | 'keeta'

interface Plataforma {
  nome: string
  comissaoPropria: number // fracao: comissao de uso quando o restaurante entrega
  comissaoEntrega: number // fracao: comissao quando a plataforma entrega
  pagamentoOnline: number // fracao: taxa sobre pedido pago pelo app
  mensalidadePropriaCentavos: number
  mensalidadeEntregaCentavos: number
  isencaoAteCentavos: number // mensalidade isenta se o faturamento mensal for menor que isso
  estimativa?: boolean
  nota: string
}

const PLATAFORMAS: Record<PlatKey, Plataforma> = {
  ifood: {
    nome: 'iFood',
    comissaoPropria: 0.12, // Plano Basico
    comissaoEntrega: 0.23, // Plano Entrega
    pagamentoOnline: 0.032,
    mensalidadePropriaCentavos: 11000,
    mensalidadeEntregaCentavos: 15000,
    isencaoAteCentavos: 180000, // mensalidade so acima de R$ 1.800/mes
    nota: 'Comissao 12% (voce entrega) ou 23% (iFood entrega) + 3,2% no pagamento pelo app. Mensalidade so acima de R$ 1.800/mes.',
  },
  '99food': {
    nome: '99Food',
    comissaoPropria: 0.109,
    comissaoEntrega: 0.089,
    pagamentoOnline: 0.032,
    mensalidadePropriaCentavos: 0,
    mensalidadeEntregaCentavos: 0,
    isencaoAteCentavos: 0,
    nota: 'Comissao 10,9% (voce entrega) ou 8,9% (99Food entrega) + ~3,2% no pagamento pelo app. Mensalidade gratis para contratos novos.',
  },
  aiqfome: {
    nome: 'aiqfome',
    comissaoPropria: 0.0999,
    comissaoEntrega: 0.22,
    pagamentoOnline: 0.0299,
    mensalidadePropriaCentavos: 8990,
    mensalidadeEntregaCentavos: 8990,
    isencaoAteCentavos: 150000, // mensalidade isenta ate R$ 1.500/mes
    nota: 'Comissao 9,99% (voce entrega) ou 22% (aiqfome entrega) + 2,99% no pagamento online. Mensalidade R$ 89,90, isenta ate R$ 1.500/mes.',
  },
  keeta: {
    nome: 'Keeta',
    comissaoPropria: 0.1,
    comissaoEntrega: 0.13,
    pagamentoOnline: 0.03,
    mensalidadePropriaCentavos: 0,
    mensalidadeEntregaCentavos: 0,
    isencaoAteCentavos: 0,
    estimativa: true,
    nota: 'A Keeta nao publica tabela oficial; usamos uma estimativa (~2 a 3 pontos abaixo da media de mercado). Confirme os valores no seu contrato.',
  },
}

const OPCOES_PLATAFORMA: ReadonlyArray<SelectOption<PlatKey>> = (
  Object.keys(PLATAFORMAS) as PlatKey[]
).map((k) => ({ value: k, label: PLATAFORMAS[k].nome }))

type Recebimento = 'direto' | 'pix' | 'cartao'

const OPCOES_RECEBIMENTO: ReadonlyArray<{ value: Recebimento; label: string }> = [
  { value: 'direto', label: 'Pix/maquininha seus' },
  { value: 'pix', label: 'Intermediado (Pix)' },
  { value: 'cartao', label: 'Intermediado (cartao)' },
]

const pct = (f: number) =>
  `${(f * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

export function Comparador() {
  const [ticketCentavos, setTicketCentavos] = useState<number | null>(7000) // R$ 70
  const [pedidos, setPedidos] = useState(300)
  const [plataforma, setPlataforma] = useState<PlatKey>('ifood')
  const [plataformaEntrega, setPlataformaEntrega] = useState(false)
  const [pagamentoApp, setPagamentoApp] = useState(true)
  const [planoEscolhido, setPlanoEscolhido] = useState('')
  const [recebimento, setRecebimento] = useState<Recebimento>('direto')

  // Planos reais da vitrine: o visitante escolhe qual comparar; default = Profissional (o do meio).
  const { data: planosData } = usePlanosPublicos()
  const planos = planosData ?? []
  const idDefault =
    planos.find((p) => /profissional/i.test(p.nome))?.id ??
    planos[Math.min(1, Math.max(0, planos.length - 1))]?.id ??
    ''
  const planoId = planoEscolhido || idDefault
  const plano = planos.find((p) => p.id === planoId)
  const mensWhaviso = plano?.valor_centavos ?? FALLBACK_MENS_CENTAVOS
  const taxaWhaviso = plano?.taxa_intermediacao_centavos ?? FALLBACK_TAXA_CENTAVOS

  const ticket = ticketCentavos ?? 0
  const faturamento = ticket * pedidos

  // --- Plataforma escolhida ---
  const p = PLATAFORMAS[plataforma]
  const comissaoFracao = plataformaEntrega ? p.comissaoEntrega : p.comissaoPropria
  const pagFracao = pagamentoApp ? p.pagamentoOnline : 0
  const custoComissao = Math.round(faturamento * comissaoFracao)
  const custoPagamento = Math.round(faturamento * pagFracao)
  const mensPlataforma =
    faturamento >= p.isencaoAteCentavos
      ? plataformaEntrega
        ? p.mensalidadeEntregaCentavos
        : p.mensalidadePropriaCentavos
      : 0
  const totalPlataforma = custoComissao + custoPagamento + mensPlataforma

  // --- Whaviso, tres cenarios ---
  const whDireto = mensWhaviso
  const whPix = mensWhaviso + pedidos * (taxaWhaviso + ASAAS_PIX_CENTAVOS)
  const whCartao =
    mensWhaviso +
    pedidos * (taxaWhaviso + ASAAS_CARTAO_FIXO_CENTAVOS) +
    Math.round(faturamento * ASAAS_CARTAO_PCT)
  const totalWhaviso =
    recebimento === 'direto' ? whDireto : recebimento === 'pix' ? whPix : whCartao

  const economia = totalPlataforma - totalWhaviso
  const economiaPct = totalPlataforma > 0 ? economia / totalPlataforma : 0

  return (
    <section id="comparar" className="mx-auto w-full max-w-5xl px-4 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl text-salvia md:text-4xl">
          Quanto voce deixa de pagar em taxa
        </h2>
        <p className="mt-3 text-tinta-2">
          As plataformas cobram uma porcentagem que cresce a cada pedido. No whaviso o custo e
          fixo e baixo, ou zero quando voce recebe direto. Faca a conta com os seus numeros.
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {/* Controles */}
        <div className="rounded-card border border-linha bg-cartao p-6">
          <div className="grid gap-5">
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-tinta">
                  Ticket medio
                </span>
                <MoneyInput value={ticketCentavos} onChange={setTicketCentavos} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-tinta">
                  Pedidos por mes
                </span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={pedidos === 0 ? '' : pedidos}
                  onChange={(e) => setPedidos(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                  className="w-full rounded-input border border-linha bg-cartao px-3 py-2.5 text-sm text-tinta tabular focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-tinta">
                Comparar com
              </span>
              <Select
                value={plataforma}
                onChange={setPlataforma}
                options={OPCOES_PLATAFORMA}
                ariaLabel="Plataforma para comparar"
              />
            </label>

            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-tinta">A plataforma faz a entrega</span>
              <Switch
                ligado={plataformaEntrega}
                onMudar={setPlataformaEntrega}
                rotulo="A plataforma faz a entrega"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-tinta">Clientes pagam pelo aplicativo</span>
              <Switch
                ligado={pagamentoApp}
                onMudar={setPagamentoApp}
                rotulo="Clientes pagam pelo aplicativo"
              />
            </div>

            <p className="rounded-input bg-papel-2 p-3 text-xs text-tinta-2">
              {p.estimativa ? 'Estimativa. ' : ''}
              {p.nota}
            </p>

            <label className="block border-t border-linha pt-4">
              <span className="mb-1.5 block text-sm font-semibold text-tinta">
                Plano do whaviso
              </span>
              {planos.length > 0 ? (
                <Select
                  value={planoId}
                  onChange={setPlanoEscolhido}
                  options={planos.map((p) => ({
                    value: p.id,
                    label: `${p.nome}: ${brl(p.valor_centavos)}/mês`,
                  }))}
                  ariaLabel="Plano do whaviso para comparar"
                />
              ) : (
                <span className="block text-sm text-tinta-2">Carregando planos...</span>
              )}
              <span className="mt-1 block text-xs text-tinta-2">
                {brl(mensWhaviso)}/mês + {brl(taxaWhaviso)} por transação intermediada (ou Pix próprio
                sem taxa).
              </span>
            </label>
          </div>
        </div>

        {/* Resultados */}
        <div className="grid content-start gap-4">
          <div className="rounded-card border border-linha bg-cartao p-6">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-lg text-tinta">No {p.nome}</span>
              <span className="tabular text-2xl font-bold text-barro">{brl(totalPlataforma)}</span>
            </div>
            <span className="text-xs text-tinta-2">por mes</span>
            <dl className="mt-4 grid gap-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-tinta-2">
                  Comissao ({pct(comissaoFracao)})
                </dt>
                <dd className="tabular text-tinta">{brl(custoComissao)}</dd>
              </div>
              {pagamentoApp && (
                <div className="flex justify-between">
                  <dt className="text-tinta-2">Pagamento no app ({pct(p.pagamentoOnline)})</dt>
                  <dd className="tabular text-tinta">{brl(custoPagamento)}</dd>
                </div>
              )}
              {mensPlataforma > 0 && (
                <div className="flex justify-between">
                  <dt className="text-tinta-2">Mensalidade</dt>
                  <dd className="tabular text-tinta">{brl(mensPlataforma)}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-card border-2 border-salvia bg-salvia-claro p-6">
            <div className="mb-3">
              <SegmentedControl
                value={recebimento}
                onChange={setRecebimento}
                options={OPCOES_RECEBIMENTO}
                ariaLabel="Como voce recebe no whaviso"
                preencher
              />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-display text-lg text-salvia">No whaviso</span>
              <span className="tabular text-2xl font-bold text-folha">{brl(totalWhaviso)}</span>
            </div>
            <span className="text-xs text-tinta-2">
              por mes{' '}
              {recebimento === 'direto'
                ? '(so a mensalidade: Pix na sua conta ou maquininha na entrega)'
                : recebimento === 'pix'
                  ? `(mensalidade + ${brl(taxaWhaviso)} + ${brl(ASAAS_PIX_CENTAVOS)} de Pix por pedido)`
                  : `(mensalidade + ${brl(taxaWhaviso)} + 2,99% + ${brl(ASAAS_CARTAO_FIXO_CENTAVOS)} por pedido)`}
            </span>

            {economia > 0 && (
              <div className="mt-4 rounded-input bg-cartao p-4 text-center">
                <span className="block text-sm text-tinta-2">Voce economiza por mes</span>
                <span className="tabular block text-3xl font-bold text-folha">{brl(economia)}</span>
                <span className="text-sm text-tinta-2">
                  {pct(economiaPct)} a menos que no {p.nome} ({brl(economia * 12)} por ano)
                </span>
              </div>
            )}
          </div>

          <p className="text-xs text-tinta-2">
            O whaviso atende quem ja e seu cliente, sem comissao por pedido, e convive com os canais
            que voce ja usa. Mantenha o que vende por fora e traga para ca o seu proprio movimento.
          </p>
        </div>
      </div>

      <div className="mt-10 flex flex-col items-center gap-3 text-center">
        <a
          href="#planos"
          className="rounded-input bg-salvia px-8 py-3 text-base font-semibold text-papel hover:bg-tinta"
        >
          Conhecer os planos
        </a>
        <span className="text-xs text-tinta-2">Comece a receber pedidos pelo seu WhatsApp.</span>
      </div>
    </section>
  )
}
