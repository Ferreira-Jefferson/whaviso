import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Info, Send } from 'lucide-react'
import { cn, Spinner } from '@/shared/ui'

const TEXTO_MAX = 4096

interface Props {
  aoEnviar: (texto: string) => void
  enviando: boolean
  /** Quando preenchido, o campo some e mostramos o motivo (ex.: janela fechada, com a automacao). */
  bloqueio: string | null
}

/** Caixa de resposta do atendente. So aparece quando o contrato permite responder (conversa em 'humano'). */
export function Composer({ aoEnviar, enviando, bloqueio }: Props) {
  const [texto, setTexto] = useState('')

  if (bloqueio) {
    return (
      <div className="flex-none border-t border-linha bg-papel-2 px-4 py-3">
        <p className="flex items-start gap-2 text-[13px] text-tinta-2">
          <Info className="mt-0.5 size-4 flex-none" aria-hidden />
          <span>{bloqueio}</span>
        </p>
      </div>
    )
  }

  const limpo = texto.trim()
  const podeEnviar = limpo.length > 0 && limpo.length <= TEXTO_MAX && !enviando

  function enviar() {
    if (!podeEnviar) return
    aoEnviar(limpo)
    setTexto('')
  }

  function aoSubmeter(e: FormEvent) {
    e.preventDefault()
    enviar()
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia; Shift+Enter quebra linha.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  return (
    <form onSubmit={aoSubmeter} className="flex-none border-t border-linha bg-cartao px-3 py-2.5">
      <div className="flex items-end gap-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value.slice(0, TEXTO_MAX))}
          onKeyDown={aoTeclar}
          rows={1}
          placeholder="Escreva uma mensagem"
          aria-label="Mensagem para o cliente"
          className={cn(
            'max-h-32 min-h-11 w-full flex-1 resize-none rounded-input border border-linha bg-cartao px-3 py-2.5 text-sm text-tinta [field-sizing:content]',
            'placeholder:text-tinta-2/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia',
          )}
        />
        <button
          type="submit"
          disabled={!podeEnviar}
          aria-label="Enviar mensagem"
          className={cn(
            'inline-flex size-11 flex-none items-center justify-center rounded-pill bg-salvia text-papel',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia',
            'disabled:cursor-not-allowed disabled:bg-salvia/50',
          )}
        >
          {enviando ? <Spinner className="text-papel" /> : <Send className="size-5" aria-hidden />}
        </button>
      </div>
    </form>
  )
}
