// Rodape do site publico (landing + paginas legais): centralizado e discreto.
// Segue o padrao de rodape de SaaS (referencia social + Privacidade + Termos), com
// a identificacao legal (CNPJ) em letra miuda embaixo. A referencia social aponta
// para a pagina do Whaviso no Facebook.
import { Link } from 'react-router'
import { BellLogo } from './BellLogo'

const FACEBOOK_URL = 'https://www.facebook.com/whaviso/'

// Glifo "f" do Facebook, inline (evita depender de icone de marca de terceiros).
function IconeFacebook({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073c0 6.026 4.388 11.02 10.125 11.927v-8.437H7.078v-3.49h3.047V9.43c0-3.017 1.792-4.684 4.533-4.684 1.313 0 2.686.235 2.686.235v2.968h-1.513c-1.49 0-1.955.929-1.955 1.886v2.263h3.328l-.532 3.49h-2.796v8.437C19.612 23.094 24 18.1 24 12.073z" />
    </svg>
  )
}

export function RodapeSite() {
  return (
    <footer className="border-t border-linha">
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Link to="/" className="inline-flex items-center gap-2 text-salvia">
            <BellLogo className="size-5 text-dourado" />
            <span className="font-display font-semibold">whaviso</span>
          </Link>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-tinta-2">
            <a
              href={FACEBOOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-salvia hover:underline"
            >
              <IconeFacebook className="size-4" />
              Facebook
            </a>
            <Link to="/politica-de-privacidade" className="hover:text-salvia hover:underline">
              Privacidade
            </Link>
            <Link to="/termos-de-uso" className="hover:text-salvia hover:underline">
              Termos
            </Link>
          </nav>
        </div>
        <p className="mt-3 text-center text-[10px] leading-relaxed text-tinta-2 opacity-60">
          CNPJ 56.883.976/0001-04 · Caçapava/SP, Brasil.
        </p>
      </div>
    </footer>
  )
}
