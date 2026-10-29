// RealtimeProvider: mantem UMA conexao SSE por loja ativa e faz a ponte para o TanStack Query.
//  - evento de dominio: invalida as queries do dominio (MAPA_INVALIDACAO) e avisa os
//    handlers registrados por useRealtime;
//  - `resync` ou reconexao: invalida as raizes do MAPA_INVALIDACAO (pode ter havido perda; entrega at-most-once).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getAccessToken, renovarSessao, signOut } from '../supabase'
import { useSessao } from '../auth'
import { useLojaAtiva } from '../tenant'
import type { TipoEvento } from '../contracts/_generated'
import { MAPA_INVALIDACAO } from './mapa'
import { ClienteRealtime, type EstadoRealtime, type EventoRealtime } from './cliente'
import { RealtimeContext, type HandlerRealtime } from './context'

const RAIZES_REALTIME = [...new Set(Object.values(MAPA_INVALIDACAO).flat())]

export function RealtimeProvider({ children, urlBase }: { children: ReactNode; urlBase?: string }) {
  const { status } = useSessao()
  const loja = useLojaAtiva()
  const qc = useQueryClient()
  const [estado, setEstado] = useState<EstadoRealtime>('desligado')
  const handlers = useRef(new Map<TipoEvento, Set<HandlerRealtime>>())
  const lojaId = loja?.id ?? null
  const base = urlBase ?? import.meta.env.VITE_API_URL ?? ''

  useEffect(() => {
    if (status !== 'logado' || !lojaId) {
      setEstado('desligado')
      return
    }
    const cliente = new ClienteRealtime({
      url: `${base.replace(/\/$/, '')}/realtime/stream`,
      lojaId,
      getToken: getAccessToken,
      renovarToken: renovarSessao,
      aoSessaoExpirada: () => void signOut(),
      aoEstado: setEstado,
      aoResync: () => {
        // So as raizes que o SSE alimenta (nao a app inteira): evita tempestade de refetch.
        for (const prefixo of RAIZES_REALTIME) void qc.invalidateQueries({ queryKey: [prefixo] })
      },
      aoEvento: (e: EventoRealtime) => {
        for (const prefixo of MAPA_INVALIDACAO[e.tipo]) {
          void qc.invalidateQueries({ queryKey: [prefixo] })
        }
        handlers.current.get(e.tipo)?.forEach((h) => h(e))
      },
    })
    cliente.iniciar()
    return () => cliente.parar()
  }, [status, lojaId, base, qc])

  const value = useMemo(
    () => ({
      estado,
      registrar: (tipo: TipoEvento, h: HandlerRealtime) => {
        const set = handlers.current.get(tipo) ?? new Set<HandlerRealtime>()
        set.add(h)
        handlers.current.set(tipo, set)
        return () => {
          set.delete(h)
        }
      },
    }),
    [estado],
  )

  return <RealtimeContext value={value}>{children}</RealtimeContext>
}
