// Conexao LISTEN dedicada (F5), FORA do pool de requisicoes. Uma por instancia da api.
// Reconecta com backoff exponencial + jitter e refaz o LISTEN; o chamador e avisado por
// `aoReconectar` (eventos podem ter sido perdidos: o front deve refazer a query).
// Pooler em modo transacao (pgbouncer) nao suporta LISTEN: use connection string direta/session.
import pg from 'pg'

export interface OpcoesEscuta {
  connectionString: string
  canal: string
  aoMensagem: (payload: string) => void
  /** Chamado apos reconexao bem sucedida (nao na primeira conexao). */
  aoReconectar?: () => void
  /** Chamado a cada queda/falha (sem dado sensivel: so um codigo). */
  aoFalha?: (motivo: string) => void
  backoffMinMs?: number
  backoffMaxMs?: number
  applicationName?: string
}

export interface Escuta {
  iniciar(): void
  parar(): Promise<void>
  /** true enquanto ha conexao com LISTEN ativo. */
  conectada(): boolean
}

export function criarEscuta(opcoes: OpcoesEscuta): Escuta {
  const min = opcoes.backoffMinMs ?? 500
  const max = opcoes.backoffMaxMs ?? 30_000
  let cliente: pg.Client | null = null
  let ativa = false
  let ok = false
  let jaConectouUmaVez = false
  let tentativas = 0
  let timer: NodeJS.Timeout | null = null
  let geracao = 0

  const agendar = () => {
    if (!ativa || timer) return
    const base = Math.min(max, min * 2 ** tentativas)
    const espera = Math.round(base / 2 + Math.random() * (base / 2))
    tentativas += 1
    timer = setTimeout(() => {
      timer = null
      void conectar()
    }, espera)
    timer.unref()
  }

  const cair = (minha: number, motivo: string) => {
    if (minha !== geracao) return
    geracao += 1 // invalida os handlers do cliente morto
    ok = false
    const velho = cliente
    cliente = null
    velho?.removeAllListeners()
    // Evita 'error' sem ouvinte derrubar o processo enquanto encerra o socket.
    velho?.on('error', () => {})
    void velho?.end().catch(() => {})
    opcoes.aoFalha?.(motivo)
    agendar()
  }

  const conectar = async () => {
    if (!ativa) return
    geracao += 1
    const minha = geracao
    const novo = new pg.Client({
      connectionString: opcoes.connectionString,
      application_name: opcoes.applicationName ?? 'whaviso_listen',
      keepAlive: true,
    })
    cliente = novo
    novo.on('error', () => cair(minha, 'erro_conexao'))
    novo.on('end', () => cair(minha, 'conexao_encerrada'))
    novo.on('notification', (msg) => {
      if (minha === geracao && msg.channel === opcoes.canal && msg.payload !== undefined) {
        opcoes.aoMensagem(msg.payload)
      }
    })
    try {
      await novo.connect()
      // LISTEN nao aceita parametro: o identificador (canal fixo do codigo) e escapado pelo pg.
      await novo.query(['LISTEN', novo.escapeIdentifier(opcoes.canal)].join(' '))
      if (minha !== geracao || !ativa) return
      ok = true
      tentativas = 0
      const reconectou = jaConectouUmaVez
      jaConectouUmaVez = true
      if (reconectou) opcoes.aoReconectar?.()
    } catch {
      cair(minha, 'falha_ao_conectar')
    }
  }

  return {
    iniciar() {
      if (ativa) return
      ativa = true
      void conectar()
    },
    async parar() {
      ativa = false
      ok = false
      if (timer) clearTimeout(timer)
      timer = null
      geracao += 1
      const velho = cliente
      cliente = null
      if (velho) {
        velho.removeAllListeners()
        velho.on('error', () => {})
        await velho.end().catch(() => {})
      }
    },
    conectada: () => ok,
  }
}
