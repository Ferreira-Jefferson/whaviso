// ErrorBoundary global: captura erros de RENDER (não os de fetch, que o React
// Query trata por tela) e mostra uma tela calma "Calmo Editorial" com opção de
// recarregar. Fica em app/ (pode importar shared). Class component porque o
// React só oferece error boundaries via getDerivedStateFromError/componentDidCatch.
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  erro: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: false }

  static getDerivedStateFromError(): State {
    return { erro: true }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    // Sem telemetria no MVP; log local ajuda no diagnóstico em dev.
    // Nunca registramos dados sensíveis (telefone/Pix), só a mensagem do erro.
    console.error('Erro de render capturado pelo ErrorBoundary:', erro, info)
  }

  render() {
    if (!this.state.erro) return this.props.children
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
}
