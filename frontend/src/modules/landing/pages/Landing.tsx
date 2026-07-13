// Landing pública (/): página de venda. Layout próprio de marketing (largo,
// responsivo), distinto do PublicLayout (coluna estreita das telas do devedor).
// Posicionamento: o whaviso é a AGENDA DE VENDAS E RECEBIMENTOS de quem trabalha
// com confiança e fiado (revenda de venda direta). A notificação é o motor; o
// diferencial é a GESTÃO (o que vendeu, quanto tem a receber e de quem, por
// categoria). Duas linguagens distintas: a das MENSAGENS ao devedor segue as
// Regras de Ouro (só "aviso/lembrete/combinado", sem pressão, restrição do canal
// WhatsApp); a do PRODUTO/landing pode falar de vendas, recebimentos e resultado.
import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router'
import {
  CalendarClock,
  MessageSquare,
  ShieldCheck,
  Wallet,
  RefreshCw,
  Unlock,
  LayoutDashboard,
  Users,
  Tags,
  PiggyBank,
} from 'lucide-react'
import {
  Button,
  Card,
  StatCard,
  MoneyText,
  WhatsAppPreview,
  BellLogo,
  RodapeSite,
  cn,
} from '@/shared/ui'

const MENSAGEM_EXEMPLO =
  'Oi, Ana. Marina pediu pra te lembrar do combinado: pedido do catálogo, R$ 89,90 para 10 de junho.'

// Os quatro avisos que a pessoa recebe ao longo do ciclo (D-2 → D+1). Vitrine de
// marketing: "Já paguei" aparece em todas as etapas, com "Ver Pix" e o opt-out
// sempre visível (Regra de Ouro). Os textos espelham os templates do backend e
// seguem neutros (nenhuma palavra de pressão), mesmo com tema de venda direta.
const MENSAGENS_CICLO = [
  {
    dia: 'D-2',
    rotulo: 'Aviso antecipado',
    texto:
      'Oi, Ana. Marina pediu pra te lembrar do combinado: pedido do catálogo, R$ 89,90 para 10 de junho.',
    botoes: ['Já paguei', 'Ver Pix', 'Sair dos lembretes'],
    horario: '09:00',
  },
  {
    dia: 'D-1',
    rotulo: 'Véspera',
    texto: 'Oi, Ana. Amanhã é o dia: pedido do catálogo, R$ 89,90.',
    botoes: ['Já paguei', 'Ver Pix', 'Sair dos lembretes'],
    horario: '09:00',
  },
  {
    dia: 'D',
    rotulo: 'No dia',
    texto: 'Oi, Ana. Hoje é o dia: pedido do catálogo, R$ 89,90.',
    botoes: ['Já paguei', 'Ver Pix', 'Sair dos lembretes'],
    horario: '08:30',
  },
  {
    dia: 'D+1',
    rotulo: 'Encerramento',
    texto: 'Oi, Ana. Último aviso: pedido do catálogo, R$ 89,90.',
    botoes: ['Já paguei', 'Ver Pix', 'Sair dos lembretes'],
    horario: '09:00',
  },
]

export default function LandingPage() {
  useEffect(() => {
    document.title = 'Whaviso | sua agenda de vendas e recebimentos'
  }, [])

  return (
    <div className="min-h-dvh">
      <CabecalhoMarketing />
      <main>
        <Hero />
        <NegocioOrganizado />
        <ComoFunciona />
        <Mensagem />
        <Planos />
      </main>
      <RodapeSite />
    </div>
  )
}

// ---------------------------------------------------------------------------

function CabecalhoMarketing() {
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
      <Link to="/" className="inline-flex items-center gap-2 text-salvia" aria-label="whaviso, início">
        <BellLogo className="size-6 text-dourado" />
        <span className="font-display text-xl font-semibold">whaviso</span>
      </Link>
      <nav className="flex items-center gap-2">
        <Link
          to="/entrar"
          className="rounded-pill px-4 py-2 text-sm font-medium text-salvia transition-colors hover:bg-salvia-claro"
        >
          Entrar
        </Link>
        <Link to="/entrar?modo=cadastro">
          <Button>Criar conta</Button>
        </Link>
      </nav>
    </header>
  )
}

function Hero() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pt-10 pb-16 sm:pt-16">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div className="animate-rise">
          <span className="inline-flex items-center gap-2 rounded-pill bg-salvia-claro px-3 py-1 text-sm font-medium text-salvia">
            <CalendarClock strokeWidth={1.75} className="size-4" />
            Sua agenda de vendas e recebimentos
          </span>
          <h1 className="mt-5 font-display text-4xl leading-tight text-salvia sm:text-5xl">
            Acompanhe suas vendas, saiba de quem tem a receber e escolha quem o
            whaviso lembra por você.
          </h1>
          <p className="mt-4 max-w-prose text-lg text-tinta-2">
            O whaviso é a agenda do seu negócio: anote cada venda ou combinado,
            veja quanto tem a receber de cada pessoa e deixe os lembretes saírem
            sozinhos pelo WhatsApp, na hora certa.
          </p>
          <p className="mt-3 max-w-prose text-sm text-tinta-2">
            Separe por categoria (cada marca, cada linha que você revende) e
            acompanhe o que entrou, o que falta e quanto rendeu.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/entrar?modo=cadastro">
              <Button className="px-7 py-3 text-base">Começar de graça</Button>
            </Link>
            <a
              href="#como-funciona"
              className="inline-flex items-center justify-center rounded-pill border border-linha bg-cartao px-7 py-3 text-base font-medium text-tinta transition-colors hover:bg-papel-2"
            >
              Como funciona
            </a>
          </div>
          <p className="mt-4 text-sm text-tinta-2">
            Grátis para começar. Sem instalar nenhum aplicativo.
          </p>
        </div>

        <div className="animate-rise">
          <WhatsAppPreview
            texto={MENSAGEM_EXEMPLO}
            botoes={['Já paguei', 'Ver Pix', 'Sair dos lembretes']}
            horario="09:00"
            className="shadow-[0_12px_40px_rgba(32,50,42,0.12)]"
          />
        </div>
      </div>
    </section>
  )
}

// Pilar da GESTÃO (o diferencial). Vem logo depois do hero para comunicar valor
// antes do "como funciona". À esquerda, um mock ilustrativo do painel (StatCard do
// design system); à direita, os quatro ganhos de gestão.
const GESTAO = [
  {
    icone: LayoutDashboard,
    titulo: 'Tudo num painel só',
    texto:
      'Veja num relance o que tem a receber, o que já recebeu e o que ainda falta, sem depender do caderno nem da memória.',
  },
  {
    icone: Users,
    titulo: 'Cada pessoa num lugar',
    texto:
      'Todos os combinados de uma pessoa reunidos: o que já acertou e o que falta, mesmo que o nome tenha variado entre um pedido e outro.',
  },
  {
    icone: Tags,
    titulo: 'Separe por categoria',
    texto:
      'Crie uma categoria para cada marca ou linha que você revende (Natura, Boticário, ou o que for) e filtre do jeito que te ajuda.',
  },
  {
    icone: PiggyBank,
    titulo: 'Saiba o seu resultado',
    texto:
      'Anote quanto custou e veja quanto sobrou de verdade, por período e por categoria. Vender bastante é bom; lucrar é o que importa.',
  },
]

function NegocioOrganizado() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-16">
      <h2 className="font-display text-3xl text-salvia">Seu negócio organizado</h2>
      <p className="mt-2 max-w-prose text-tinta-2">
        Mais que lembrar: o whaviso mostra o que você vendeu, o que tem a receber
        e de quem, para você decidir com clareza e crescer.
      </p>

      <div className="mt-8 grid items-center gap-10 lg:grid-cols-2">
        {/* Mock ilustrativo do painel */}
        <div
          className="rounded-2xl border border-linha bg-cartao p-5 shadow-[0_12px_40px_rgba(32,50,42,0.12)]"
          aria-label="Exemplo ilustrativo do painel"
        >
          <div className="mb-4 flex items-center justify-between">
            <span className="font-medium text-tinta">Seu mês</span>
            <span className="text-sm text-tinta-2">junho</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatCard rotulo="A receber" centavos={124000} detalhe="3 pessoas" tom="salvia" />
            <StatCard rotulo="Recebido" centavos={318000} detalhe="8 combinados" tom="folha" />
          </div>
          <div className="mt-3 flex items-center justify-between rounded-2xl bg-salvia-claro px-4 py-3">
            <span className="text-sm font-medium text-salvia">Resultado estimado</span>
            <MoneyText centavos={94000} className="text-lg font-semibold text-salvia" />
          </div>
          <div className="mt-4">
            <span className="text-xs text-tinta-2">Por categoria</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {['Natura', 'Boticário', 'Bijuterias'].map((c) => (
                <span
                  key={c}
                  className="rounded-pill border border-linha bg-papel-2 px-3 py-1 text-xs text-tinta-2"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Ganhos de gestão */}
        <ul className="flex flex-col gap-5">
          {GESTAO.map((g) => {
            const Icon = g.icone
            return (
              <li key={g.titulo} className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-salvia-claro text-salvia">
                  <Icon strokeWidth={1.75} className="size-5" />
                </span>
                <div>
                  <h3 className="text-lg text-tinta">{g.titulo}</h3>
                  <p className="mt-0.5 text-sm text-tinta-2">{g.texto}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

const PASSOS = [
  {
    icone: CalendarClock,
    titulo: 'Anote a venda ou o combinado',
    texto:
      'Cadastre a pessoa, o que foi vendido, o valor, a data e sua chave Pix. Fica tudo no seu painel, com ou sem envio de aviso.',
  },
  {
    icone: MessageSquare,
    titulo: 'Avisos automáticos na hora certa',
    texto:
      'Dois dias antes, na véspera e no dia combinado, o sistema envia os avisos pelo WhatsApp automaticamente. No dia seguinte, um último aviso, e o ciclo encerra.',
  },
  {
    icone: ShieldCheck,
    titulo: 'Um toque para confirmar',
    texto:
      'A pessoa toca em “Já paguei” e pronto. Em estado concluído, o whaviso para de enviar: nada de mensagens repetidas.',
  },
]

const ETAPAS_CICLO = [
  { dia: 'D-2', titulo: 'Aviso antecipado', desc: 'Um toque amistoso, com antecedência.' },
  { dia: 'D-1', titulo: 'Organização', desc: 'Lembrete na véspera, sem pressa.' },
  { dia: 'D', titulo: 'No dia', desc: 'A mensagem do dia combinado.' },
  { dia: 'D+1', titulo: 'Encerramento', desc: 'Último aviso. Depois disso, nada mais.' },
]

function ComoFunciona() {
  return (
    <section id="como-funciona" className="border-t border-linha bg-papel-2">
      <div className="mx-auto w-full max-w-5xl px-4 py-16">
        <h2 className="font-display text-3xl text-salvia">Como funciona</h2>
        <p className="mt-2 max-w-prose text-tinta-2">
          Anote a venda. Os avisos saem automaticamente. Você acompanha tudo no
          painel.
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-3">
          {PASSOS.map((p) => {
            const Icon = p.icone
            return (
              <Card key={p.titulo} className="flex flex-col gap-3 bg-cartao">
                <span className="flex size-10 items-center justify-center rounded-pill bg-salvia-claro text-salvia">
                  <Icon strokeWidth={1.75} className="size-5" />
                </span>
                <h3 className="text-lg text-tinta">{p.titulo}</h3>
                <p className="text-sm text-tinta-2">{p.texto}</p>
              </Card>
            )
          })}
        </div>

        {/* Linha do tempo ilustrativa do ciclo (D-2 → D+1) */}
        <div className="mt-10">
          <h3 className="text-lg text-salvia">O ciclo de lembretes</h3>
          <ol className="mt-4 grid gap-4 sm:grid-cols-4" aria-label="Ciclo de lembretes ilustrativo">
            {ETAPAS_CICLO.map((e, i) => (
              <li key={e.dia} className="relative">
                <Card className="flex h-full flex-col gap-1 bg-cartao">
                  <span className="font-display text-2xl font-semibold text-salvia">
                    {e.dia}
                  </span>
                  <span className="text-sm font-medium text-tinta">{e.titulo}</span>
                  <span className="text-xs text-tinta-2">{e.desc}</span>
                </Card>
                {i < ETAPAS_CICLO.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-linha sm:block"
                  >
                    →
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-tinta-2">
            Quando o combinado é concluído ou encerrado, os lembretes param na
            hora. Nenhuma mensagem depois que tudo se resolve.
          </p>
        </div>
      </div>
    </section>
  )
}

function Mensagem() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-16">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-3xl text-salvia">
            O que a outra pessoa recebe
          </h2>
          <p className="mt-4 max-w-prose text-tinta-2">
            Mensagens automáticas e claras, com botões diretos. Quem recebe não
            precisa de conta nem de aplicativo, basta tocar.
          </p>
          <ul className="mt-6 flex flex-col gap-3 text-sm text-tinta">
            <li className="flex items-start gap-2">
              <ShieldCheck strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-folha" />
              Confirmação por botão, sem conversas ou robôs insistindo.
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-folha" />
              Tudo no fuso de São Paulo, com valores em reais.
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-folha" />
              Sempre com a opção de encerrar os avisos, se a pessoa preferir.
            </li>
          </ul>
        </div>
        <CarrosselMensagens />
      </div>
    </section>
  )
}

// Carrossel dos quatro avisos do ciclo: mostra um por vez, com etiqueta da etapa e
// indicadores. Sem dependência externa; só estado local de índice. Navega clicando
// nas bordas (esquerda/direita) da bolha ou arrastando/deslizando para o lado.
function CarrosselMensagens() {
  const [indice, setIndice] = useState(0)
  const total = MENSAGENS_CICLO.length
  const m = MENSAGENS_CICLO[indice]
  const ir = (n: number) => setIndice((n + total) % total)

  // Arrastar/deslizar: guarda o X inicial do ponteiro e, ao soltar, se o
  // deslocamento passar do limiar, troca de aviso (esquerda → próximo).
  const arrasteX = useRef<number | null>(null)
  const houveArraste = useRef(false)
  const LIMIAR = 40
  const aoSoltar = (xFinal: number) => {
    const inicio = arrasteX.current
    arrasteX.current = null
    if (inicio === null) return
    const delta = xFinal - inicio
    if (Math.abs(delta) < LIMIAR) return
    // Arraste de verdade: navega e marca para o onClick da borda se ignorar (o
    // clique sintético dispara logo após este pointerup, no mesmo gesto).
    houveArraste.current = true
    ir(indice + (delta < 0 ? 1 : -1))
  }
  const aoClicarBorda = (n: number) => {
    if (houveArraste.current) {
      houveArraste.current = false
      return
    }
    ir(n)
  }

  if (!m) return null

  return (
    <div aria-roledescription="carrossel" aria-label="Exemplos de aviso por etapa do ciclo">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-pill bg-salvia-claro px-3 py-1 text-sm text-salvia">
          <span className="font-display font-semibold">{m.dia}</span>
          {m.rotulo}
        </span>
      </div>

      {/* Sem setas visíveis: navega por zonas de clique invisíveis nas bordas
          (faixa vertical central, onde ficava o botão) ou arrastando para o lado.
          touch-action: pan-y deixa o scroll vertical livre e captura só o gesto
          horizontal. */}
      <div
        className="relative touch-pan-y select-none"
        onPointerDown={(e) => {
          arrasteX.current = e.clientX
        }}
        onPointerUp={(e) => aoSoltar(e.clientX)}
        onPointerCancel={() => {
          arrasteX.current = null
        }}
      >
        <WhatsAppPreview key={indice} texto={m.texto} botoes={m.botoes} horario={m.horario} />
        <button
          type="button"
          onClick={() => aoClicarBorda(indice - 1)}
          aria-label="Aviso anterior"
          className="absolute left-0 top-1/2 h-1/2 w-1/4 -translate-y-1/2 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
        />
        <button
          type="button"
          onClick={() => aoClicarBorda(indice + 1)}
          aria-label="Próximo aviso"
          className="absolute right-0 top-1/2 h-1/2 w-1/4 -translate-y-1/2 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
        />
      </div>

      <div className="mt-4 flex justify-center gap-2" role="tablist" aria-label="Etapas do ciclo">
        {MENSAGENS_CICLO.map((mm, idx) => (
          <button
            key={mm.dia}
            type="button"
            role="tab"
            onClick={() => ir(idx)}
            aria-selected={idx === indice}
            aria-label={`Aviso ${mm.dia}, ${mm.rotulo}`}
            className={cn(
              'h-2 rounded-pill transition-all',
              idx === indice ? 'w-6 bg-salvia' : 'w-2 bg-linha hover:bg-salvia-claro',
            )}
          />
        ))}
      </div>
    </div>
  )
}

// Pilares do modelo de carteira de créditos de envio. Seção estática: a landing é
// pública e não consulta a api. Sem valores fixos de preço aqui (preço e curva de
// quantidade vivem na carteira, dentro do painel, atrás de login).
const CREDITOS = [
  {
    icone: Wallet,
    titulo: 'Pague pelo que envia',
    texto:
      'Cada envio de aviso usa um crédito de envio. Você só gasta quando um lembrete sai pelo WhatsApp, sem mensalidade obrigatória.',
  },
  {
    icone: RefreshCw,
    titulo: 'Recarregue quando quiser',
    texto:
      'Comprou poucos? Recarregue a qualquer momento, na quantidade que precisar. O saldo fica guardado na sua carteira até você usar.',
  },
  {
    icone: Unlock,
    titulo: 'Tudo liberado',
    texto:
      'Todos os recursos ficam disponíveis para qualquer conta: agenda, categorias, painel e lembretes. O único limite é o seu saldo de créditos.',
  },
]

function Planos() {
  return (
    <section id="planos" className="border-t border-linha bg-papel-2">
      <div className="mx-auto w-full max-w-5xl px-4 py-16">
        <h2 className="font-display text-3xl text-salvia">Créditos de envio</h2>
        <p className="mt-2 max-w-prose text-tinta-2">
          Anotar suas vendas e usar o painel é livre. Você só compra créditos de
          envio quando quiser disparar os lembretes, e paga pelo que usa.
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-3">
          {CREDITOS.map((c) => {
            const Icon = c.icone
            return (
              <Card key={c.titulo} className="flex h-full flex-col gap-3 bg-cartao">
                <span className="flex size-10 items-center justify-center rounded-pill bg-salvia-claro text-salvia">
                  <Icon strokeWidth={1.75} className="size-5" />
                </span>
                <h3 className="text-lg text-tinta">{c.titulo}</h3>
                <p className="flex-1 text-sm text-tinta-2">{c.texto}</p>
              </Card>
            )
          })}
        </div>

        {/* CTA principal: o card verde fecha a seção (substitui o antigo botão
            discreto e a seção duplicada que existia no fim da página). */}
        <Card className="mt-10 flex flex-col items-center gap-5 bg-salvia px-6 py-12 text-center text-papel">
          <h2 className="font-display text-3xl text-papel">
            Comece pelo que você já faz: anotar.
          </h2>
          <p className="max-w-prose text-papel/85">
            Crie sua conta em minutos e comece a acompanhar suas vendas e
            recebimentos hoje mesmo.
          </p>
          <Link to="/entrar?modo=cadastro">
            <Button variante="secondary" className="px-7 py-3 text-base">
              Criar conta grátis
            </Button>
          </Link>
        </Card>
      </div>
    </section>
  )
}
