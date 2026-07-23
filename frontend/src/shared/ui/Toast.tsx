// Toast: aviso curto e temporário no rodapé da tela (ex.: "Combinado enviado"), fora do
// fluxo do formulário. Mesmo padrão de contexto de `shared/auth` (createContext + hook
// que exige o Provider). Portal fixo no body (mesmo motivo do ModalPortal: páginas vivem
// dentro de um `.animate-rise` com `transform`, que vira bloco de contenção do
// `position: fixed`). `aria-live="polite"` para leitores de tela anunciarem sem
// interromper o que está sendo lido. Auto-dismiss configurável por chamada.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from './cn'

export type ToastTom = 'info' | 'sucesso' | 'erro'

// Mesma paleta do Banner.tsx (tons reaproveitados para consistência visual).
const TONS: Record<ToastTom, string> = {
  info: 'bg-salvia-claro text-salvia border-salvia/20',
  sucesso: 'bg-salvia-claro text-folha border-folha/20',
  erro: 'bg-ambar-claro text-barro border-barro/20',
}

const DURACAO_PADRAO_MS = 4000

interface ToastItem {
  id: number
  mensagem: string
  tom: ToastTom
}

export interface MostrarToastOpcoes {
  tom?: ToastTom
  /** Tempo até o auto-dismiss, em ms. */
  duracaoMs?: number
}

export interface ToastState {
  mostrarToast: (mensagem: string, opcoes?: MostrarToastOpcoes) => void
}

const ToastContext = createContext<ToastState | null>(null)

// Único arquivo novo previsto para o toast (plano): context, hook e provider ficam juntos
// aqui, ao contrário do padrão de shared/auth (context.ts/hooks.ts/AuthProvider.tsx
// separados). O aviso do react-refresh é só sobre fast refresh em dev, não um erro.
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastState {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast deve ser usado dentro de <ToastProvider>.')
  }
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ToastItem[]>([])
  const proximoId = useRef(0)

  const remover = useCallback((id: number) => {
    setItens((atual) => atual.filter((item) => item.id !== id))
  }, [])

  const mostrarToast = useCallback(
    (mensagem: string, opcoes?: MostrarToastOpcoes) => {
      const id = proximoId.current++
      const tom = opcoes?.tom ?? 'sucesso'
      const duracaoMs = opcoes?.duracaoMs ?? DURACAO_PADRAO_MS
      setItens((atual) => [...atual, { id, mensagem, tom }])
      window.setTimeout(() => remover(id), duracaoMs)
    },
    [remover],
  )

  const value = useMemo<ToastState>(() => ({ mostrarToast }), [mostrarToast])

  return (
    <ToastContext value={value}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          role="status"
          className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
        >
          {itens.map((item) => (
            <div
              key={item.id}
              className={cn(
                'pointer-events-auto max-w-sm rounded-input border px-4 py-2.5 text-sm shadow-lg',
                TONS[item.tom],
              )}
            >
              {item.mensagem}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext>
  )
}
