// Comparador de custo da landing: o visitante informa ticket médio, pedidos/mês e o
// plano do whaviso; cada plataforma vira um card estático (ordem fixa) com os próprios
// controles de entrega e pagamento, mostrando o custo mensal e a diferença pro whaviso.
//
// Dinheiro SEMPRE em centavos (int); conversão só via MoneyInput/brl (convenção do
// repo). As taxas das plataformas são as de 2026 (ver notas por plataforma). Os valores
// do Asaas são os REAIS, sem promoção (a promo acaba, o preço real permanece).
import { useState } from 'react'
import { SegmentedControl, Switch } from '@/shared/ui'
import { brl } from '@/shared/format'
import { usePlanosPublicos } from '../planos'

// --- Custos do whaviso ---
// A taxa de intermediação vem do PLANO escolhido (0,50/0,40/0,30); estes são os custos do PSP.
const ASAAS_PIX_CENTAVOS = 199 // Asaas: Pix recebido, preço real pós-promoção
const ASAAS_CARTAO_FIXO_CENTAVOS = 49 // Asaas: fixo por cobrança no crédito
const ASAAS_CARTAO_PCT = 0.0299 // Asaas: crédito à vista (preço real)
// Fallback enquanto os planos não carregaram (ou nenhum ativo): mantém o comparador funcional.
const FALLBACK_MENS_CENTAVOS = 14900
const FALLBACK_TAXA_CENTAVOS = 50

type PlatKey = 'ifood' | '99food' | 'aiqfome'

interface Plataforma {
  nome: string
  comissaoPropria: number // fração: comissão de uso quando o restaurante entrega
  comissaoEntrega: number // fração: comissão quando a plataforma entrega
  pagamentoOnline: number // fração: taxa sobre pedido pago pelo app
  mensalidadePropriaCentavos: number
  mensalidadeEntregaCentavos: number
  isencaoAteCentavos: number // mensalidade isenta se o faturamento mensal for menor que isso
  nota: string
}

// Ordem de declaração = ordem dos cards (fixa, nunca reordena).
const PLATAFORMAS: Record<PlatKey, Plataforma> = {
  ifood: {
    nome: 'iFood',
    comissaoPropria: 0.12, // Plano Básico
    comissaoEntrega: 0.23, // Plano Entrega
    pagamentoOnline: 0.032,
    mensalidadePropriaCentavos: 11000,
    mensalidadeEntregaCentavos: 15000,
    isencaoAteCentavos: 180000, // mensalidade só acima de R$ 1.800/mês
    nota: 'Comissão 12% (você entrega) ou 23% (iFood entrega) + 3,2% no pagamento pelo app. Mensalidade só acima de R$ 1.800/mês.',
  },
  '99food': {
    nome: '99Food',
    comissaoPropria: 0.109,
    comissaoEntrega: 0.089,
    pagamentoOnline: 0.032,
    mensalidadePropriaCentavos: 0,
    mensalidadeEntregaCentavos: 0,
    isencaoAteCentavos: 0,
    nota: 'Comissão 10,9% (você entrega) ou 8,9% (99Food entrega) + ~3,2% no pagamento pelo app. Mensalidade grátis para contratos novos.',
  },
  aiqfome: {
    nome: 'aiqfome',
    comissaoPropria: 0.0999,
    comissaoEntrega: 0.22,
    pagamentoOnline: 0.0299,
    mensalidadePropriaCentavos: 8990,
    mensalidadeEntregaCentavos: 8990,
    isencaoAteCentavos: 150000, // mensalidade isenta até R$ 1.500/mês
    nota: 'Comissão 9,99% (você entrega) ou 22% (aiqfome entrega) + 2,99% no pagamento online. Mensalidade R$ 89,90, isenta até R$ 1.500/mês.',
  },
}

const ORDEM_PLATAFORMAS = Object.keys(PLATAFORMAS) as PlatKey[]

type Recebimento = 'direto' | 'pix' | 'cartao'

const OPCOES_RECEBIMENTO: ReadonlyArray<{ value: Recebimento; label: string }> = [
  { value: 'direto', label: 'Próprio' },
  { value: 'pix', label: 'Pix' },
  { value: 'cartao', label: 'Cartão' },
]

interface ConfigPlataforma {
  entrega: boolean // a plataforma faz a entrega
  pagamento: boolean // cliente paga pelo app
}

// Entrega começa desligada nos três: o whaviso não tem entrega própria, então comparar
// com a entrega do concorrente também desligada é a comparação mais justa por padrão.
const CONFIG_INICIAL: Record<PlatKey, ConfigPlataforma> = {
  ifood: { entrega: false, pagamento: true },
  '99food': { entrega: false, pagamento: true },
  aiqfome: { entrega: false, pagamento: true },
}

const pct = (f: number) =>
  `${(f * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

// Diferença com sinal: "+R$ 100" quando positivo; negativo já vem com o "-" do brl
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
  const [ticketCentavos, setTicketCentavos] = useState<number | null>(3000) // R$ 30
  const [pedidos, setPedidos] = useState(100)
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

  // --- Whaviso, três cenários ---
  const porPedidoPix = taxaWhaviso + ASAAS_PIX_CENTAVOS
  // Parte fixa do cartão: taxa whaviso (varia por PLANO: 0,50/0,40/0,30) + fixo do
  // gateway, somadas num só número. Mostrar os dois fixos lado a lado (ex.: "R$ 0,50 +
  // R$ 0,49") lê como erro de digitação, não como duas cobranças distintas.
  const fixoCartao = taxaWhaviso + ASAAS_CARTAO_FIXO_CENTAVOS
  const porPedidoCartao = fixoCartao + Math.round(ticket * ASAAS_CARTAO_PCT)
  const porPedidoWhaviso =
    recebimento === 'direto' ? 0 : recebimento === 'pix' ? porPedidoPix : porPedidoCartao
  const totalWhaviso = mensWhaviso + pedidos * porPedidoWhaviso

  return (
    <section id="comparar" className="mx-auto w-full max-w-7xl px-4 py-16">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="font-display text-3xl text-salvia md:text-4xl">
          Seu dinheiro, na mesa de outro app
        </h2>
        <p className="mt-3 text-tinta-2">
          As plataformas cobram uma porcentagem que cresce a cada pedido. No whaviso o custo é
          fixo e baixo, ou zero quando você recebe direto. Veja agora quanto você está deixando na
          mesa de cada aplicativo.
        </p>
      </div>

      {/* Filtros globais: ticket, pedidos e plano do whaviso */}
      <div className="mt-10 rounded-card border border-linha bg-cartao p-6">
        <div className="grid gap-5 md:grid-cols-3">
          <label className="block">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-tinta">Ticket médio</span>
              <span className="tabular text-sm font-semibold text-salvia">{brl(ticket)}</span>
            </div>
            <div className="rounded-pill border border-linha bg-papel-2 px-4 py-2.5">
              <input
                type="range"
                min={10}
                max={300}
                step={5}
                value={Math.round(ticket / 100)}
                onChange={(e) => setTicketCentavos(Number(e.target.value) * 100)}
                aria-label="Ticket médio"
                className="block w-full cursor-pointer accent-salvia"
              />
            </div>
          </label>
          <label className="block">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-tinta">Pedidos por mês</span>
              <span className="tabular text-sm font-semibold text-salvia">
                {pedidos.toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="rounded-pill border border-linha bg-papel-2 px-4 py-2.5">
              <input
                type="range"
                min={10}
                max={1500}
                step={10}
                value={pedidos}
                onChange={(e) => setPedidos(Number(e.target.value))}
                aria-label="Pedidos por mês"
                className="block w-full cursor-pointer accent-salvia"
              />
            </div>
          </label>
          <label className="block">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-tinta">Plano do whaviso</span>
              {plano && (
                <span className="tabular text-sm font-semibold text-salvia">
                  {brl(plano.valor_centavos)}/mês
                </span>
              )}
            </div>
            {planos.length > 0 ? (
              <SegmentedControl
                value={planoId}
                onChange={setPlanoEscolhido}
                options={planos.map((p) => ({ value: p.id, label: p.nome }))}
                ariaLabel="Plano do whaviso para comparar"
                preencher
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
            Custo por mês
          </span>
          <span className="tabular text-3xl font-bold text-folha">{brl(totalWhaviso)}</span>

          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-semibold text-tinta">Como você recebe</span>
            <SegmentedControl
              value={recebimento}
              onChange={setRecebimento}
              options={OPCOES_RECEBIMENTO}
              ariaLabel="Como você recebe no whaviso"
              preencher
            />
          </div>

          <dl className="mt-6 mb-3 grid gap-1.5 text-sm">
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
              <dt className="text-tinta-2">Taxas no mês</dt>
              <dd className="tabular text-tinta">{brl(totalWhaviso - mensWhaviso)}</dd>
            </div>
          </dl>

          <p className="mt-auto border-t border-salvia/30 pt-3 text-xs text-tinta-2">
            {recebimento === 'direto'
              ? 'Só a mensalidade: Pix ou maquininha seus, sem taxa por pedido.'
              : recebimento === 'pix'
                ? `Mensalidade + ${brl(porPedidoPix)} por pedido.`
                : `Mensalidade + ${brl(fixoCartao)} + 2,99% por pedido.`}
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
                Custo por mês
              </span>
              <span className="tabular text-3xl font-bold text-barro">{brl(r.total)}</span>

              <div className="mt-4 grid gap-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-tinta">{p.nome} faz a entrega</span>
                  <Switch
                    compacto
                    ligado={cfg.entrega}
                    onMudar={(v) => ajustarConfig(key, { entrega: v })}
                    rotulo={`${p.nome} faz a entrega`}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-tinta">Cliente paga pelo app</span>
                  <Switch
                    compacto
                    ligado={cfg.pagamento}
                    onMudar={(v) => ajustarConfig(key, { pagamento: v })}
                    rotulo={`Cliente paga pelo app no ${p.nome}`}
                  />
                </div>
              </div>

              <dl className="mt-6 grid gap-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-tinta-2">Comissão ({pct(r.comissaoFracao)})</dt>
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
        O whaviso atende quem já é seu cliente, sem comissão por pedido, e coexiste com os canais
        que você já usa: continue vendendo nos apps de entrega e traga para cá o movimento que já é
        seu.
      </p>

      <div className="mt-8 flex flex-col items-center gap-3 text-center">
        <a
          href="#planos"
          className="rounded-input bg-salvia px-8 py-3 text-base font-semibold text-papel hover:bg-tinta"
        >
          Conhecer os planos
        </a>
      </div>
    </section>
  )
}
