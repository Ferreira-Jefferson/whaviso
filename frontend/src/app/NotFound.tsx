// 404 amigável (estética editorial). Leva de volta à home do papel quando há
// sessão (user → /app, owner → /admin) ou à landing quando não há.
// Sem termos alarmistas, só um caminho de volta gentil.
import { useEffect } from 'react'
import { Link } from 'react-router'
import { Button, BellLogo } from '@/shared/ui'
import { useAuth, homeDoPapel } from '@/shared/auth'

export default function NotFound() {
  const { status, role } = useAuth()
  const destino = status === 'logado' ? homeDoPapel(role) : '/'
  const rotuloDestino = status === 'logado' ? 'Ir para o início' : 'Voltar à página inicial'

  useEffect(() => {
    document.title = 'Página não encontrada | whaviso'
  }, [])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-pill bg-salvia-claro text-salvia">
        <BellLogo className="size-7 text-dourado" />
      </span>
      <p className="font-display text-6xl font-semibold text-linha">404</p>
      <h1 className="font-display text-3xl text-salvia">Não encontramos esta página</h1>
      <p className="max-w-sm text-tinta-2">
        O link pode ter mudado ou expirado. Vamos te levar de volta por um
        caminho seguro.
      </p>
      <Link to={destino}>
        <Button>{rotuloDestino}</Button>
      </Link>
    </div>
  )
}
