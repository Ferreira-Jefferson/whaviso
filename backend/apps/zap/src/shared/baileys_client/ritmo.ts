// Ritmo anti-bloqueio: serializa os envios e espaça com um GAP aleatório, faz
// pausa longa a cada lote e respeita um teto por hora. Generaliza o enviarParaLista
// do teste para um único pacer que o drainer da outbox usa por mensagem.

export interface ConfigRitmo {
  gapMin: number
  gapMax: number
  batchSize: number
  batchPauseMin: number
  batchPauseMax: number
  maxPorHora: number
}

const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const aleatorio = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min

export class Pacer {
  private cadeia: Promise<unknown> = Promise.resolve()
  private ultimoEnvioMs = 0
  private enviadosNoLote = 0
  private janelaInicioMs = 0
  private enviadosNaJanela = 0

  constructor(private readonly cfg: ConfigRitmo) {}

  /** Enfileira um envio respeitando GAP/lote/teto. Erros não travam a fila. */
  agendar<T>(fn: () => Promise<T>): Promise<T> {
    const proxima = this.cadeia.then(async () => {
      await this.aguardarVez()
      const r = await fn()
      this.registrar() // conta só envios que deram certo
      return r
    })
    this.cadeia = proxima.catch(() => undefined)
    return proxima
  }

  private async aguardarVez(): Promise<void> {
    // teto por hora (janela deslizante simples)
    if (this.enviadosNaJanela >= this.cfg.maxPorHora) {
      const espera = 3_600_000 - (Date.now() - this.janelaInicioMs)
      if (espera > 0) await dormir(espera)
      this.janelaInicioMs = Date.now()
      this.enviadosNaJanela = 0
    }
    // pausa longa ao fechar um lote
    if (this.enviadosNoLote >= this.cfg.batchSize) {
      await dormir(aleatorio(this.cfg.batchPauseMin, this.cfg.batchPauseMax))
      this.enviadosNoLote = 0
    }
    // GAP humano entre destinatários (só completa o que faltar do intervalo)
    if (this.ultimoEnvioMs > 0) {
      const desde = Date.now() - this.ultimoEnvioMs
      const gap = aleatorio(this.cfg.gapMin, this.cfg.gapMax)
      if (desde < gap) await dormir(gap - desde)
    }
  }

  private registrar(): void {
    const agora = Date.now()
    if (this.janelaInicioMs === 0) this.janelaInicioMs = agora
    this.ultimoEnvioMs = agora
    this.enviadosNoLote++
    this.enviadosNaJanela++
  }
}
