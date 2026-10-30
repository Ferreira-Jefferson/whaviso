// Landing publica: apresenta o produto e leva ao login. Sem dado de servidor.
import { useEffect } from 'react'
import { Link } from 'react-router'
import { BellLogo, RodapeSite } from '@/shared/ui'
import { Comparador } from '../components/Comparador'
import { Planos } from '../components/Planos'

const BENEFICIOS = [
  {
    titulo: 'Pedidos pelo WhatsApp',
    texto: 'O atendimento recebe e organiza os pedidos na conversa, sem planilha e sem anotar à mão.',
  },
  {
    titulo: 'Tudo num só painel',
    texto: 'Acompanhe o que chegou, o que está em preparo e o que já saiu, em tempo real.',
  },
  {
    titulo: 'Gestão do restaurante',
    texto: 'Cardápio, caixa, entregas e estoque no mesmo lugar, junto com os pedidos.',
  },
]

export default function Landing() {
  useEffect(() => {
    document.title = 'Whaviso | Pedidos de restaurante por WhatsApp'
  }, [])

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4">
        <span className="inline-flex items-center gap-2 text-salvia">
          <BellLogo className="size-9 text-dourado" />
          <span className="font-display text-xl font-semibold">whaviso</span>
        </span>
        <nav className="flex items-center gap-1 sm:gap-2">
          <a
            href="#comparar"
            className="hidden rounded-input px-3 py-2 text-sm font-medium text-tinta-2 hover:text-tinta sm:block"
          >
            Comparar custos
          </a>
          <a
            href="#planos"
            className="hidden rounded-input px-3 py-2 text-sm font-medium text-tinta-2 hover:text-tinta sm:block"
          >
            Planos
          </a>
          <Link
            to="/entrar"
            className="rounded-input bg-salvia px-5 py-2.5 text-sm font-semibold text-papel hover:bg-tinta"
          >
            Entrar
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-4 py-16 text-center md:py-24">
          <BellLogo className="size-20 text-dourado" />
          <h1 className="font-display text-4xl text-salvia md:text-5xl">
            Pedidos do seu restaurante, direto pelo WhatsApp
          </h1>
          <p className="max-w-xl text-lg text-tinta-2">
            O Whaviso automatiza o atendimento dos pedidos e reúne tudo num painel simples, para você
            vender mais e perder menos tempo.
          </p>
          <Link
            to="/entrar"
            className="rounded-input bg-salvia px-8 py-3 text-base font-semibold text-papel hover:bg-tinta"
          >
            Entrar
          </Link>
        </section>

        <section className="mx-auto grid w-full max-w-7xl gap-4 px-4 pb-16 md:grid-cols-3">
          {BENEFICIOS.map((b) => (
            <div key={b.titulo} className="rounded-card border border-linha bg-cartao p-6">
              <h2 className="font-display text-xl text-salvia">{b.titulo}</h2>
              <p className="mt-2 text-sm text-tinta-2">{b.texto}</p>
            </div>
          ))}
        </section>

        <Comparador />

        <Planos />
      </main>

      <RodapeSite />
    </div>
  )
}
