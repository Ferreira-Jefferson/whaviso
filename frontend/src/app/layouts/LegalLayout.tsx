// LegalLayout: paginas juridicas publicas (Politica de Privacidade, Termos de Uso).
// Coluna de leitura confortavel (mais larga que o PublicLayout do devedor) com o
// rodape do site (RodapeSite) para navegar entre as paginas legais e voltar a home.
import { Outlet, Link } from 'react-router'
import { BellLogo, RodapeSite } from '@/shared/ui'

export function LegalLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center px-4 py-5">
        <Link to="/" className="inline-flex items-center gap-2 text-salvia">
          <BellLogo className="size-6 text-dourado" />
          <span className="font-display text-xl font-semibold">whaviso</span>
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <RodapeSite />
    </div>
  )
}
