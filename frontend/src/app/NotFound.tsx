// 404 amigavel: leva de volta ao painel (a RequireAuth manda para o login se nao houver sessao).
import { useEffect } from 'react'
import { Link } from 'react-router'
import { BellLogo, Button } from '@/shared/ui'
import { ROTA_INICIAL } from './rotas'

export default function NotFound() {
  useEffect(() => {
    document.title = 'Página não encontrada | Whaviso'
  }, [])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-pill bg-salvia-claro text-salvia">
        <BellLogo className="size-7 text-dourado" />
      </span>
      <p className="font-display text-6xl font-semibold text-linha">404</p>
      <h1 className="font-display text-3xl text-salvia">Não encontramos esta página</h1>
      <p className="max-w-sm text-tinta-2">O link pode ter mudado. Vamos te levar de volta ao painel.</p>
      <Link to={ROTA_INICIAL}>
        <Button>Ir para o painel</Button>
      </Link>
    </div>
  )
}
