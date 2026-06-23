// PublicLayout: coluna única max-w-md, mobile-first (devedor chega pelo WhatsApp).
import { Outlet, Link } from 'react-router'
import { BellLogo } from '@/shared/ui'

export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8">
      <header className="mb-8 w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-2 text-salvia">
          <BellLogo className="size-6 text-dourado" />
          <span className="font-display text-xl font-semibold">whaviso</span>
        </Link>
      </header>
      <main className="w-full max-w-md flex-1">
        <Outlet />
      </main>
      <footer className="mt-8 w-full max-w-md text-center text-xs text-tinta-2">
        Avise o combinado.
      </footer>
    </div>
  )
}
