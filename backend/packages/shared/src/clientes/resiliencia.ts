import { falha, Transitorio, type ErroProvedor, type Resultado } from './erros'

// Resiliencia das fronteiras de provedor externo (RES-001..003): timeout + disjuntor (circuit
// breaker) + limitador de taxa. Reutilizavel por qualquer Cliente* (mapas hoje; LLM/whats depois).
// Tudo com relogio/sono/agenda injetaveis, para teste deterministico sem rede nem timer real.

export type Relogio = () => number
export type Dormir = (ms: number) => Promise<void>
/** Agenda `cb` para daqui a `ms` e devolve um cancelador. Injetavel nos testes. */
export type Agendar = (ms: number, cb: () => void) => () => void

export const dormirReal: Dormir = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve())

const agendarReal: Agendar = (ms, cb) => {
  const id = setTimeout(cb, ms)
  return () => clearTimeout(id)
}

/**
 * Executa `fn` com teto de tempo: se nao concluir em `timeoutMs`, aborta o sinal entregue a `fn`
 * e resolve `falha(Transitorio 'timeout')`. `fn` recebe um AbortSignal para repassar ao transporte.
 */
export async function comTimeout<T>(
  fn: (sinal: AbortSignal) => Promise<Resultado<T, ErroProvedor>>,
  timeoutMs: number,
  agendar: Agendar = agendarReal,
): Promise<Resultado<T, ErroProvedor>> {
  const controlador = new AbortController()
  let cancelar: () => void = () => {}
  const estouro = new Promise<Resultado<T, ErroProvedor>>((resolve) => {
    cancelar = agendar(timeoutMs, () => {
      controlador.abort()
      resolve(falha(new Transitorio('tempo esgotado', { codigo: 'timeout' })))
    })
  })
  try {
    return await Promise.race([fn(controlador.signal), estouro])
  } finally {
    cancelar()
  }
}

export type EstadoDisjuntor = 'fechado' | 'aberto' | 'meio_aberto'

export interface OpcoesDisjuntor {
  /** Falhas retentaveis consecutivas para abrir o circuito. */
  limiar: number
  /** Tempo (ms) que o circuito fica aberto antes de liberar 1 sonda (meio-aberto). */
  reabrirAposMs: number
  relogio?: Relogio
}

/**
 * Disjuntor simples: abre apos `limiar` falhas RETENTAVEIS seguidas e passa a recusar na hora
 * (sem chamar o provedor) ate `reabrirAposMs`; entao libera UMA sonda (meio-aberto). Sonda ok
 * fecha, sonda com falha reabre. Falha PERMANENTE (ex.: endereco nao encontrado) e resposta
 * saudavel do provedor: nao conta para abrir e zera o contador.
 */
export class Disjuntor {
  #estado: EstadoDisjuntor = 'fechado'
  #falhasSeguidas = 0
  #abertoEm = 0
  #sondando = false
  readonly #limiar: number
  readonly #reabrirAposMs: number
  readonly #relogio: Relogio

  constructor(op: OpcoesDisjuntor) {
    this.#limiar = Math.max(1, op.limiar)
    this.#reabrirAposMs = Math.max(0, op.reabrirAposMs)
    this.#relogio = op.relogio ?? Date.now
  }

  /** Estado logico agora (transiciona aberto -> meio_aberto quando o tempo de espera passou). */
  get estado(): EstadoDisjuntor {
    if (this.#estado === 'aberto' && this.#relogio() - this.#abertoEm >= this.#reabrirAposMs) return 'meio_aberto'
    return this.#estado
  }

  async executar<T>(fn: () => Promise<Resultado<T, ErroProvedor>>): Promise<Resultado<T, ErroProvedor>> {
    const estado = this.estado
    if (estado === 'aberto') return this.#recusa()
    if (estado === 'meio_aberto') {
      if (this.#sondando) return this.#recusa()
      this.#sondando = true
      this.#estado = 'meio_aberto'
    }
    let r: Resultado<T, ErroProvedor>
    try {
      r = await fn()
    } catch (e) {
      this.#registrarFalha()
      this.#sondando = false
      throw e
    }
    if (r.ok || !r.erro.retentavel) this.#registrarSucesso()
    else this.#registrarFalha()
    this.#sondando = false
    return r
  }

  #recusa(): Resultado<never, ErroProvedor> {
    return falha(new Transitorio('provedor em disjuntor aberto', { codigo: 'circuito_aberto' }))
  }

  #registrarSucesso(): void {
    this.#falhasSeguidas = 0
    this.#estado = 'fechado'
  }

  #registrarFalha(): void {
    this.#falhasSeguidas += 1
    if (this.#estado === 'meio_aberto' || this.#falhasSeguidas >= this.#limiar) {
      this.#estado = 'aberto'
      this.#abertoEm = this.#relogio()
      this.#falhasSeguidas = this.#limiar
    }
  }
}

export interface OpcoesLimitador {
  relogio?: Relogio
  dormir?: Dormir
}

/**
 * Limitador de taxa por intervalo minimo entre chamadas (ex.: Nominatim ~1 req/s). Serializa o
 * espacamento mesmo sob concorrencia: `aguardar()` reserva a proxima janela de forma sincrona
 * antes de dormir, entao duas chamadas simultaneas saem com `intervaloMs` entre elas.
 */
export class LimitadorTaxa {
  #proximoEm = 0
  readonly #intervaloMs: number
  readonly #relogio: Relogio
  readonly #dormir: Dormir

  constructor(intervaloMs: number, op: OpcoesLimitador = {}) {
    this.#intervaloMs = Math.max(0, intervaloMs)
    this.#relogio = op.relogio ?? Date.now
    this.#dormir = op.dormir ?? dormirReal
  }

  async aguardar(): Promise<void> {
    const agora = this.#relogio()
    const alvo = Math.max(agora, this.#proximoEm)
    this.#proximoEm = alvo + this.#intervaloMs
    const espera = alvo - agora
    if (espera > 0) await this.#dormir(espera)
  }
}
