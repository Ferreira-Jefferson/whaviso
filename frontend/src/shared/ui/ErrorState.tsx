import type { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from './Button'
import { cn } from './cn'

interface ErrorStateProps {
  titulo?: string
  descricao?: string
  /** Mostra o botao de nova tentativa quando informado. */
  aoTentarDeNovo?: () => void
  acao?: ReactNode
  className?: string
}

/** Estado de erro de uma area (nao da pagina toda). Anunciado a leitores de tela via role=alert. */
export function ErrorState({
  titulo = 'Não foi possível carregar',
  descricao = 'O servidor não respondeu. Seus dados estão a salvo. Tente de novo em instantes.',
  aoTentarDeNovo,
  acao,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn('flex items-start gap-4 rounded-card border border-barro/30 bg-barro/10 p-6', className)}
    >
      <AlertCircle className="mt-0.5 size-7 flex-none text-barro" strokeWidth={1.75} aria-hidden />
      <div className="min-w-0">
        <h3 className="text-lg text-barro">{titulo}</h3>
        <p className="mt-1 text-sm text-tinta">{descricao}</p>
        {(aoTentarDeNovo || acao) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {aoTentarDeNovo && (
              <Button variante="secondary" onClick={aoTentarDeNovo}>
                Tentar de novo
              </Button>
            )}
            {acao}
          </div>
        )}
      </div>
    </div>
  )
}
