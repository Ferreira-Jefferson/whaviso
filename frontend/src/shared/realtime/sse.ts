// Parser de Server-Sent Events (texto "text/event-stream"), independente de rede.
// Regras do WHATWG: linhas terminadas em \n, \r ou \r\n; linha em branco despacha o evento;
// linha iniciada por ":" e comentario (heartbeat); campos id/event/data/retry.
export interface MensagemSse {
  /** Valor de `id:` (null se o evento nao trouxe). */
  id: string | null
  /** Valor de `event:` (padrao "message"). */
  evento: string
  data: string
}

export class ParserSse {
  private buffer = ''
  private id: string | null = null
  private evento = 'message'
  private dados: string[] = []
  private ultimoId: string | null = null

  constructor(
    private readonly aoMensagem: (m: MensagemSse) => void,
    /** Chamado a cada linha de comentario (ex.: ": ping"), usado como heartbeat. */
    private readonly aoComentario: () => void = () => undefined,
  ) {}

  /** Ultimo `id:` visto (para o header Last-Event-ID na reconexao). */
  get ultimoIdVisto(): string | null {
    return this.ultimoId
  }

  alimentar(trecho: string): void {
    this.buffer += trecho
    for (;;) {
      const m = /\r\n|\n|\r/.exec(this.buffer)
      if (!m) return
      // "\r" no fim do buffer pode ser metade de um "\r\n": espera o proximo trecho.
      if (m[0] === '\r' && m.index + 1 === this.buffer.length) return
      const linha = this.buffer.slice(0, m.index)
      this.buffer = this.buffer.slice(m.index + m[0].length)
      this.linha(linha)
    }
  }

  private linha(l: string): void {
    if (l === '') {
      if (this.dados.length > 0) {
        this.aoMensagem({ id: this.id, evento: this.evento, data: this.dados.join('\n') })
      }
      this.id = null
      this.evento = 'message'
      this.dados = []
      return
    }
    if (l.startsWith(':')) {
      this.aoComentario()
      return
    }
    const i = l.indexOf(':')
    const campo = i === -1 ? l : l.slice(0, i)
    let valor = i === -1 ? '' : l.slice(i + 1)
    if (valor.startsWith(' ')) valor = valor.slice(1)
    if (campo === 'data') this.dados.push(valor)
    else if (campo === 'event') this.evento = valor
    else if (campo === 'id' && !valor.includes('\0')) {
      this.id = valor
      this.ultimoId = valor
    }
  }
}
