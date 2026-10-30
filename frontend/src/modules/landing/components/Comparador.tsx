// Comparador de custo da landing: o visitante informa ticket medio, pedidos/mes e o
// plano do whaviso; cada plataforma vira um card estatico (ordem fixa) com os proprios
// controles de entrega e pagamento, mostrando o custo mensal e a diferenca pro whaviso.
//
// Dinheiro SEMPRE em centavos (int); conversao so via MoneyInput/brl (convencao do
// repo). As taxas das plataformas sao as de 2026 (ver notas por plataforma). Os valores
// do Asaas sao os REAIS, sem promocao (a promo acaba, o preco real permanece).
import { useState } from 'react'
import { Select, Switch } from '@/shared/ui'
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

type PlatKey = 'ifood' | '99food' | 'aiqfome'

interface Plataforma {
  nome: string
  comissaoPropria: number // fracao: comissao de uso quando o restaurante entrega
  comissaoEntrega: number // fracao: comissao quando a plataforma entrega
  pagamentoOnline: number // fracao: taxa sobre pedido pago pelo app
  mensalidadePropriaCentavos: number
  mensalidadeEntregaCentavos: number
  isencaoAteCentavos: number // mensalidade isenta se o faturamento mensal for menor que isso
  nota: string
}

// Ordem de declaracao = ordem dos cards (fixa, nunca reordena).
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
}

const ORDEM_PLATAFORMAS = Object.keys(PLATAFORMAS) as PlatKey[]

type Recebimento = 'direto' | 'pix' | 'cartao'

const OPCOES_RECEBIMENTO: ReadonlyArray<{ value: Recebimento; label: string }> = [
  { value: 'direto', label: 'Pix/maquininha seus' },
  { value: 'pix', label: 'Intermediado (Pix)' },
  { value: 'cartao', label: 'Intermediado (cartao)' },
]

interface ConfigPlataforma {
  entrega: boolean // a plataforma faz a entrega
  pagamento: boolean // cliente paga pelo app
}

const CONFIG_INICIAL: Record<PlatKey, ConfigPlataforma> = {
  ifood: { entrega: true, pagamento: true },
  '99food': { entrega: true, pagamento: true },
  aiqfome: { entrega: true, pagamento: true },
}

const pct = (f: number) =>
  `${(f * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

// Diferenca com sinal: "+R$ 100" quando positivo; negativo ja vem com o "-" do brl
// (nunca "+-"); zero sai sem sinal.
const sinalBrl = (centavos: number) => (centavos > 0 ? `+${brl(centavos)}` : brl(centavos))

interface CustoPlataforma {
  comissaoFracao: number
  custoComissao: number
  custoPagamento: number
  mens: number
  total: number
}

function calcularPlataforma(
  p: Plataforma,
  cfg: ConfigPlataforma,
  faturamento: number,
): CustoPlataforma {
  const comissaoFracao = cfg.entrega ? p.comissaoEntrega : p.comissaoPropria
  const pagFracao = cfg.pagamento ? p.pagamentoOnline : 0
  const custoComissao = Math.round(faturamento * comissaoFracao)
  const custoPagamento = Math.round(faturamento * pagFracao)
  const mens =
    faturamento >= p.isencaoAteCentavos
      ? cfg.entrega
        ? p.mensalidadeEntregaCentavos
        : p.mensalidadePropriaCentavos
      : 0
  return { comissaoFracao, custoComissao, custoPagamento, mens, total: custoComissao + custoPagamento + mens }
}

export function Comparador() {
  const [ticketCentavos, setTicketCentavos] = useState<number | null>(7000) // R$ 70
  const [pedidos, setPedidos] = useState(300)
  const [planoEscolhido, setPlanoEscolhido] = useState('')
  const [recebimento, setRecebimento] = useState<Recebimento>('direto')
  const [config, setConfig] = useState<Record<PlatKey, ConfigPlataforma>>(CONFIG_INICIAL)

  const ajustarConfig = (key: PlatKey, patch: Partial<ConfigPlataforma>) =>
    setConfig((c) => ({ ...c, [key]: { ...c[key], ...patch } }))

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

  // --- Whaviso, tres cenarios ---
  const porPedidoPix = taxaWhaviso + ASAAS_PIX_CENTAVOS
  const porPedidoCartao =
    taxaWhaviso + ASAAS_CARTAO_FIXO_CENTAVOS + Math.round(ticket * ASAAS_CARTAO_PCT)
  const porPedidoWhaviso =
    recebimento === 'direto' ? 0 : recebimento === 'pix' ? porPedidoPix : porPedidoCartao
  const totalWhaviso = mensWhaviso + pedidos * porPedidoWhaviso

  return (
    <section id="comparar" className="mx-auto w-full max-w-7xl px-4 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl text-salvia md:text-4xl">
          Quanto voce deixa de pagar em taxa
        </h2>
        <p className="mt-3 text-tinta-2">
          As plataformas cobram uma porcentagem que cresce a cada pedido. No whaviso o custo e
          fixo e baixo, ou zero quando voce recebe direto. Ajuste cada canal do seu jeito: quem faz
          a entrega e quem recebe o pagamento muda de app pra app.
        </p>
      </div>

      {/* Filtros globais: ticket, pedidos e plano do whaviso */}
      <div className="mt-10 rounded-card border border-linha bg-cartao p-6">
        <div className="grid gap-5 md:grid-cols-3">
          <label className="block">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-tinta">Ticket medio</span>
              <span className="tabular text-sm font-semibold text-salvia">{brl(ticket)}</span>
            </div>
            <input
              type="range"
              min={10}
              max={300}
              step={5}
              value={Math.round(ticket / 100)}
              onChange={(e) => setTicketCentavos(Number(e.target.value) * 100)}
              aria-label="Ticket medio"
              className="w-full cursor-pointer accent-salvia"
            />
          </label>
          <label className="block">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-tinta">Pedidos por mes</span>
              <span className="tabular text-sm font-semibold text-salvia">
                {pedidos.toLocaleString('pt-BR')}
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={1500}
              step={10}
              value={pedidos}
              onChange={(e) => setPedidos(Number(e.target.value))}
              aria-label="Pedidos por mes"
              className="w-full cursor-pointer accent-salvia"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-tinta">Plano do whaviso</span>
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
              <span className="block py-2.5 text-sm text-tinta-2">Carregando planos...</span>
            )}
          </label>
        </div>
        <p className="mt-3 text-xs text-tinta-2">
          Faturamento de <span className="tabular font-semibold text-tinta">{brl(faturamento)}</span>/mês. Os
          cards mostram o <span className="font-semibold text-tinta">custo mensal</span> (mensalidade + taxas)
          de cada canal, não o faturamento.
        </p>
      </div>

      {/* Quatro canais lado a lado, ordem fixa: whaviso como primeiro card */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card do whaviso (sempre o primeiro, em destaque) */}
        <div className="flex flex-col rounded-card border-2 border-salvia bg-salvia-claro p-5">
          <span className="font-display text-lg text-salvia">whaviso</span>
          <span className="mt-3 text-xs font-semibold uppercase tracking-wide text-tinta-2">
            Custo por mes
          </span>
          <span className="tabular text-3xl font-bold text-folha">{brl(totalWhaviso)}</span>

          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-semibold text-tinta">Como voce recebe</span>
            <Select
              value={recebimento}
              onChange={setRecebimento}
              options={OPCOES_RECEBIMENTO}
              ariaLabel="Como voce recebe no whaviso"
            />
          </div>

          <dl className="mt-4 grid gap-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-tinta-2">Mensalidade ({plano?.nome ?? 'plano'})</dt>
              <dd className="tabular text-tinta">{brl(mensWhaviso)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-tinta-2">Taxa por pedido</dt>
              <dd className="tabular text-tinta">
                {porPedidoWhaviso === 0 ? 'sem taxa' : brl(porPedidoWhaviso)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-tinta-2">Taxas no mes</dt>
              <dd className="tabular text-tinta">{brl(totalWhaviso - mensWhaviso)}</dd>
            </div>
          </dl>

          <p className="mt-auto border-t border-salvia/30 pt-3 text-xs text-tinta-2">
            {recebimento === 'direto'
              ? 'So a mensalidade: Pix ou maquininha seus, sem taxa por pedido.'
              : recebimento === 'pix'
                ? `Mensalidade + ${brl(porPedidoPix)} por pedido (taxa ${brl(taxaWhaviso)} + Pix ${brl(ASAAS_PIX_CENTAVOS)}).`
                : `Mensalidade + ${brl(taxaWhaviso)} + 2,99% + ${brl(ASAAS_CARTAO_FIXO_CENTAVOS)} por pedido.`}
          </p>
        </div>

        {/* Cards dos concorrentes (ordem fixa, cada um com seus controles) */}
        {ORDEM_PLATAFORMAS.map((key) => {
          const p = PLATAFORMAS[key]
          const cfg = config[key]
          const r = calcularPlataforma(p, cfg, faturamento)
          const diff = r.total - totalWhaviso
          const diffPorPedido = pedidos > 0 ? Math.round(diff / pedidos) : 0
          return (
            <div key={key} className="flex flex-col rounded-card border border-linha bg-cartao p-5">
              <span className="font-display text-lg text-tinta">{p.nome}</span>
              <span className="mt-3 text-xs font-semibold uppercase tracking-wide text-tinta-2">
                Custo por mes
              </span>
              <span className="tabular text-3xl font-bold text-barro">{brl(r.total)}</span>

              <div className="mt-4 grid gap-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-tinta">{p.nome} faz a entrega</span>
                  <Switch
                    ligado={cfg.entrega}
                    onMudar={(v) => ajustarConfig(key, { entrega: v })}
                    rotulo={`${p.nome} faz a entrega`}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-tinta">Cliente paga pelo app</span>
                  <Switch
                    ligado={cfg.pagamento}
                    onMudar={(v) => ajustarConfig(key, { pagamento: v })}
                    rotulo={`Cliente paga pelo app no ${p.nome}`}
                  />
                </div>
              </div>

              <dl className="mt-4 grid gap-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-tinta-2">Comissao ({pct(r.comissaoFracao)})</dt>
                  <dd className="tabular text-tinta">{brl(r.custoComissao)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-tinta-2">
                    {cfg.pagamento ? `Pagamento no app (${pct(p.pagamentoOnline)})` : 'Pagamento'}
                  </dt>
                  <dd className="tabular text-tinta">
                    {cfg.pagamento ? brl(r.custoPagamento) : 'por fora'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-tinta-2">Mensalidade</dt>
                  <dd className="tabular text-tinta">{r.mens > 0 ? brl(r.mens) : 'sem'}</dd>
                </div>
              </dl>

              <div className="mt-auto border-t border-linha pt-3 text-sm">
                <span className="text-tinta-2">vs whaviso: </span>
                <span className={`tabular font-semibold ${diff >= 0 ? 'text-barro' : 'text-folha'}`}>
                  {sinalBrl(diff)}
                </span>
                <span className="text-tinta-2">/mês</span>
                {pedidos > 0 && (
                  <span className="mt-0.5 block text-xs text-tinta-2">
                    {sinalBrl(diffPorPedido)} por pedido
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-6 text-center text-xs text-tinta-2">
        O whaviso atende quem ja e seu cliente, sem comissao por pedido, e convive com os canais que
        voce ja usa. Mantenha o que vende por fora e traga para ca o seu proprio movimento.
      </p>

      <div className="mt-8 flex flex-col items-center gap-3 text-center">
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
