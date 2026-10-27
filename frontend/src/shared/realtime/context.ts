import { createContext, useContext, useEffect, useRef } from 'react'
import type { TipoEvento } from '../contracts/_generated'
import type { EstadoRealtime, EventoRealtime } from './cliente'

export type HandlerRealtime = (e: EventoRealtime) => void

export interface RealtimeState {
  estado: EstadoRealtime
  registrar: (tipo: TipoEvento, h: HandlerRealtime) => () => void
}

export const RealtimeContext = createContext<RealtimeState | null>(null)

function useRealtimeCtx(): RealtimeState {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error('useRealtime deve ser usado dentro de <RealtimeProvider>.')
  return ctx
}

/** Estado da conexao ao vivo ('ao_vivo' | 'reconectando' | ...). */
export function useEstadoRealtime(): EstadoRealtime {
  return useRealtimeCtx().estado
}

/** Assina um tipo de evento (alem da invalidacao automatica de queries). O handler pode mudar sem reassinar. */
export function useRealtime(tipo: TipoEvento, handler: HandlerRealtime): void {
  const { registrar } = useRealtimeCtx()
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => registrar(tipo, (e) => ref.current(e)), [registrar, tipo])
}
