import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { useSessao } from '@/shared/auth'
import { ConfirmDialog, cn } from '@/shared/ui'

const FOCO = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia'

/**
 * Botao de sair: fica no FIM do menu lateral e exige confirmacao num modal, para nao deslogar
 * sem querer com um clique. `aoAbrir` deixa o pai fechar um painel (ex.: a folha "Mais" do mobile)
 * antes de abrir o modal.
 */
export function BotaoSair({ className, aoAbrir }: { className?: string; aoAbrir?: () => void }) {
  const { signOut } = useSessao()
  const [aberto, setAberto] = useState(false)
  const [saindo, setSaindo] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => {
          aoAbrir?.()
          setAberto(true)
        }}
        className={cn(
          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-tinta-2 hover:bg-black/5 hover:text-tinta',
          FOCO,
          className,
        )}
      >
        <LogOut className="size-5" strokeWidth={1.75} aria-hidden />
        Sair
      </button>
      <ConfirmDialog
        aberto={aberto}
        titulo="Sair da conta?"
        textoConfirmar="Sair"
        textoCancelar="Ficar"
        variante="destructive"
        carregando={saindo}
        onConfirmar={() => {
          setSaindo(true)
          void signOut()
        }}
        onCancelar={() => setAberto(false)}
      >
        Você vai precisar entrar de novo para voltar.
      </ConfirmDialog>
    </>
  )
}
