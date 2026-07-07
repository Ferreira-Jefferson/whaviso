// Blocos de apresentacao das paginas legais (co-locados no modulo legal). Estilo
// alinhado ao design system "Calmo Editorial": titulo em Lora (salvia), corpo
// em Karla (tinta-2), secoes numeradas. Sem regra de negocio aqui, so tipografia.
import { type ReactNode, useEffect } from 'react'

export function DocumentoLegal({
  titulo,
  atualizadoEm,
  tituloAba,
  children,
}: {
  titulo: string
  atualizadoEm: string
  tituloAba: string
  children: ReactNode
}) {
  useEffect(() => {
    document.title = tituloAba
  }, [tituloAba])
  return (
    <article className="pb-6">
      <h1 className="font-display text-3xl text-salvia sm:text-4xl">{titulo}</h1>
      <p className="mt-2 text-sm text-tinta-2">Última atualização: {atualizadoEm}</p>
      <div className="mt-8 space-y-9">{children}</div>
    </article>
  )
}

export function Secao({
  n,
  titulo,
  children,
}: {
  n: number
  titulo: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl text-tinta">
        {n}. {titulo}
      </h2>
      <div className="space-y-3 text-tinta-2">{children}</div>
    </section>
  )
}

export function Sub({ children }: { children: ReactNode }) {
  return <h3 className="pt-1 text-sm font-semibold text-tinta">{children}</h3>
}

export function P({ children }: { children: ReactNode }) {
  return <p className="leading-relaxed">{children}</p>
}

export function Lista({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 leading-relaxed">{children}</ul>
}

export function BaseLegal({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm">
      <span className="font-semibold text-tinta">Base legal:</span> {children}
    </p>
  )
}

// Link externo (politica de terceiro): abre em nova aba, cor da marca.
export function LinkExterno({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-salvia underline underline-offset-2 hover:text-folha"
    >
      {children}
    </a>
  )
}

// E-mail de contato como link mailto (cor da marca).
export function Email({ endereco }: { endereco: string }) {
  return (
    <a
      href={`mailto:${endereco}`}
      className="font-medium text-salvia underline underline-offset-2 hover:text-folha"
    >
      {endereco}
    </a>
  )
}
