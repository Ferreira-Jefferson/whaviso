// Cliente SSE sobre `fetch` com stream (EventSource nao envia Authorization; JWT na query
// string e proibido). Reconexao com backoff exponencial + jitter, watchdog de heartbeat,
// Last-Event-ID, e valida cada payload contra o contrato gerado (CANAIS_REALTIME).
// SEC-020/024: nao registra payload, headers nem URL com credencial.
import { CANAIS_REALTIME, tipoEvento, type TipoEvento } from '../contracts/_generated'
import { ParserSse, type MensagemSse } from './sse'

export interface EventoRealtime {
  tipo: TipoEvento
  payload: Record<string, unknown>
  id: string | null
}

export type EstadoRealtime = 'desligado' | 'conectando' | 'ao_vivo' | 'reconectando'

export interface OpcoesClienteRealtime {
  /** URL completa do stream (ex.: `${API}/realtime/stream`). */
  url: string
  getToken: () => Promise<string | null>
  renovarToken: () => Promise<string | null>
  /** Loja ativa enviada em x-loja-id; null = nao conecta. */
  lojaId: string
  aoEvento: (e: EventoRealtime) => void
  /** Estado mudou (conectando/ao_vivo/reconectando/desligado). */
  aoEstado?: (e: EstadoRealtime) => void
  /** Evento `resync` do servidor OU reconexao apos queda: o cliente pode ter perdido eventos. */
  aoResync: () => void
  /** Sessao irrecuperavel (401 apos renovar). */
  aoSessaoExpirada?: () => void
  fetchImpl?: typeof fetch
  /** Sem nenhum byte (inclusive heartbeat) por este tempo, reconecta. Padrao 60s (heartbeat ~25s). */
  watchdogMs?: number
  backoffBaseMs?: number
  backoffMaxMs?: number
  /** Injetavel em teste. */
  aleatorio?: () => number
}

export class ClienteRealtime {
  private abort: AbortController | null = null
  private parado = true
  private tentativas = 0
  private jaConectou = false
  private ultimoId: string | null = null
  private timerReconexao: ReturnType<typeof setTimeout> | null = null
  private watchdog: ReturnType<typeof setTimeout> | null = null
  private estado: EstadoRealtime = 'desligado'
  private jaRenovou = false

  constructor(private readonly o: OpcoesClienteRealtime) {}

  iniciar(): void {
    if (!this.parado) return
    this.parado = false
    void this.ciclo()
  }

  parar(): void {
    this.parado = true
    if (this.timerReconexao) clearTimeout(this.timerReconexao)
    this.timerReconexao = null
    this.limparWatchdog()
    this.abort?.abort()
    this.abort = null
    this.definirEstado('desligado')
  }

  private definirEstado(e: EstadoRealtime): void {
    if (this.estado === e) return
    this.estado = e
    this.o.aoEstado?.(e)
  }

  private limparWatchdog(): void {
    if (this.watchdog) clearTimeout(this.watchdog)
    this.watchdog = null
  }

  private armarWatchdog(ctl: AbortController): void {
    this.limparWatchdog()
    this.watchdog = setTimeout(() => ctl.abort(), this.o.watchdogMs ?? 60_000)
  }

  private agendarReconexao(esperaMinimaMs = 0): void {
    if (this.parado) return
    this.definirEstado('reconectando')
    const base = this.o.backoffBaseMs ?? 1000
    const max = this.o.backoffMaxMs ?? 30_000
    const exp = Math.min(max, base * 2 ** this.tentativas)
    const jitter = exp * 0.2 * (this.o.aleatorio ?? Math.random)()
    this.tentativas += 1
    this.timerReconexao = setTimeout(() => {
      this.timerReconexao = null
      void this.ciclo()
    }, Math.max(esperaMinimaMs, exp + jitter))
  }

  private async ciclo(): Promise<void> {
    if (this.parado) return
    this.definirEstado(this.jaConectou ? 'reconectando' : 'conectando')
    const ctl = new AbortController()
    this.abort = ctl
    try {
      const token = await this.o.getToken()
      if (!token) {
        this.o.aoSessaoExpirada?.()
        return this.parar()
      }
      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
        Authorization: `Bearer ${token}`,
        'x-loja-id': this.o.lojaId,
      }
      if (this.ultimoId) headers['Last-Event-ID'] = this.ultimoId

      this.armarWatchdog(ctl)
      const resp = await (this.o.fetchImpl ?? fetch)(this.o.url, { headers, signal: ctl.signal })

      if (resp.status === 401) {
        // Renova uma vez; se ja renovou nesta serie sem sucesso, a sessao acabou (SEC-040).
        const novo = this.jaRenovou ? null : await this.o.renovarToken().catch(() => null)
        this.jaRenovou = true
        if (novo) return void this.ciclo()
        this.o.aoSessaoExpirada?.()
        return this.parar()
      }
      if (!resp.ok || !resp.body) {
        const ra = Number(resp.headers.get('retry-after'))
        this.limparWatchdog()
        return this.agendarReconexao(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 0)
      }

      this.jaRenovou = false
      this.tentativas = 0
      const reconectou = this.jaConectou
      this.jaConectou = true
      this.definirEstado('ao_vivo')
      if (reconectou) this.o.aoResync()

      const parser = new ParserSse(
        (m) => this.mensagem(m),
        () => this.armarWatchdog(ctl),
      )
      const decoder = new TextDecoder()
      const leitor = resp.body.getReader()
      for (;;) {
        const { done, value } = await leitor.read()
        if (done) break
        this.armarWatchdog(ctl)
        parser.alimentar(decoder.decode(value, { stream: true }))
        if (parser.ultimoIdVisto) this.ultimoId = parser.ultimoIdVisto
      }
      this.limparWatchdog()
      this.agendarReconexao()
    } catch {
      this.limparWatchdog()
      // Abort manual (parar) nao reconecta; abort do watchdog e erro de rede sim.
      this.agendarReconexao()
    }
  }

  private mensagem(m: MensagemSse): void {
    if (m.evento === 'resync') {
      this.ultimoId = null // o servidor descartou o historico: nao retomar de um id velho
      this.o.aoResync()
      return
    }
    const tipo = tipoEvento.safeParse(m.evento)
    if (!tipo.success) return
    let bruto: unknown
    try {
      bruto = JSON.parse(m.data)
    } catch {
      return
    }
    // Aceita o payload direto ou o envelope EventoDominio { tipo, loja_id, ocorrido_em, payload }.
    let payload: unknown = bruto
    if (bruto && typeof bruto === 'object' && 'payload' in bruto && 'tipo' in bruto) {
      payload = (bruto as { payload: unknown }).payload
    }
    const ok = CANAIS_REALTIME[tipo.data].safeParse(payload)
    if (!ok.success) return // payload fora do contrato (ou com PII) e descartado
    this.o.aoEvento({ tipo: tipo.data, payload: ok.data as Record<string, unknown>, id: m.id })
  }
}
