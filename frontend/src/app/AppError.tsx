import { useRouteError } from 'react-router'

function isChunkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Unable to preload CSS for')
  )
}

export function AppError() {
  const error = useRouteError()

  if (isChunkError(error)) {
    window.location.replace('/')
    return null
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-4 text-center">
      <h1 className="font-display text-3xl text-salvia">
        Algo saiu do lugar por aqui
      </h1>
      <p className="max-w-sm text-tinta-2">
        Tivemos um contratempo ao montar esta tela. Recarregar costuma resolver.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center justify-center rounded-pill bg-salvia px-6 py-2.5 text-sm font-medium text-papel transition-colors hover:bg-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
      >
        Recarregar a página
      </button>
      <a href="/" className="text-sm font-medium text-salvia hover:underline">
        Voltar ao início
      </a>
    </div>
  )
}
