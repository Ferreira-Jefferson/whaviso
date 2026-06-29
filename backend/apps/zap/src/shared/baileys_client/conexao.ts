// Gerenciador da conexão Baileys: socket, QR/pareamento, reconexão robusta e
// dispatch do inbound de botões. O baileys oficial (@whiskeysockets/baileys) é ESM
// e é carregado por import() dinâmico em abrir(); o qrcode (CJS) segue por createRequire.
import { createRequire } from 'node:module'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Logger } from '@whaviso/shared/logger'
import type { Pool } from '@whaviso/shared/db'
import type { HandlerBotao, HandlerTexto, OpcoesWhats } from './tipos'
import type { AtualizacaoConexao, MensagemWA, ModuloBaileys, SocketWA } from './tipos_fork'
import { calcularBackoff, classificarDesconexao, type EstadoBackoff } from './reconexao'
import { extrairBotao, extrairTexto } from './inbound'
import { gravarSessao } from './qr'

const exigir = createRequire(import.meta.url)

interface EscritorQr {
  toFile: (caminho: string, texto: string, opcoes?: Record<string, unknown>) => Promise<void>
}

export interface DepsConexao {
  logger: Logger
  pool: Pool
}

export class GerenciadorConexao {
  private modulo: ModuloBaileys | null = null
  private sock: SocketWA | null = null
  private readonly backoff: EstadoBackoff = { tentativas: 0 }
  private reconectando = false
  private parado = false
  private conectado = false
  private numero: string | undefined
  // Versão do WhatsApp Web: buscar do GitHub a cada conexão custa segundos. Busca
  // uma vez (com timeout) e reusa; sem rede, o Baileys cai na versão embutida.
  private versao: [number, number, number] | undefined
  private readonly handlers: HandlerBotao[] = []
  private readonly handlersTexto: HandlerTexto[] = []

  constructor(
    private readonly opcoes: OpcoesWhats,
    private readonly deps: DepsConexao,
  ) {}

  onBotao(cb: HandlerBotao): void {
    this.handlers.push(cb)
  }

  onTexto(cb: HandlerTexto): void {
    this.handlersTexto.push(cb)
  }

  obterSocket(): SocketWA | null {
    return this.sock
  }

  estaConectado(): boolean {
    return this.conectado
  }

  numeroAtual(): string | undefined {
    return this.numero
  }

  async conectar(): Promise<void> {
    this.parado = false
    await this.abrir()
  }

  async parar(): Promise<void> {
    this.parado = true
    this.limparSocket()
    this.conectado = false
    await gravarSessao(this.deps.pool, { status: 'desconectado' }).catch(() => undefined)
  }

  // Desconexão deliberada do admin: faz logout no WhatsApp, apaga a sessão local
  // e zera o estado. A próxima `conectar()` recomeça do zero e emite um QR novo.
  async desconectar(): Promise<void> {
    this.parado = true
    try {
      await this.sock?.logout()
    } catch {
      /* o socket pode já estar morto; segue limpando local */
    }
    this.limparSocket()
    this.limparSessao()
    this.conectado = false
    this.numero = undefined
    this.backoff.tentativas = 0
    await gravarSessao(this.deps.pool, { status: 'desconectado', numero: null, qr: null }).catch(
      () => undefined,
    )
  }

  // Busca a versão do WhatsApp Web só na primeira conexão e cacheia. Corre contra
  // um timeout de 3s: se a rede do GitHub estiver lenta/indisponível, segue sem
  // versão (o Baileys usa a embutida) em vez de travar a geração do QR.
  private async obterVersao(): Promise<[number, number, number] | undefined> {
    if (this.versao || !this.modulo) return this.versao
    const modulo = this.modulo
    try {
      const r = await Promise.race([
        modulo.fetchLatestBaileysVersion(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
      ])
      if (r) this.versao = r.version
    } catch {
      /* sem rede: cai na versão embutida do pacote (version undefined) */
    }
    return this.versao
  }

  private async abrir(): Promise<void> {
    if (!this.modulo) {
      // baileys oficial (WhiskeySockets) é ESM e tipado: carregamos por import()
      // dinâmico (não por createRequire, que era gambiarra pro fork de types quebrado).
      // makeWASocket é o DEFAULT export; os utilitários são nomeados. Usamos o oficial
      // por causa do suporte a LID: o fork antigo era rejeitado pelo WhatsApp com ack 463.
      const bail = (await import('@whiskeysockets/baileys')) as unknown as {
        default: ModuloBaileys['makeWASocket']
        useMultiFileAuthState: ModuloBaileys['useMultiFileAuthState']
        fetchLatestBaileysVersion: ModuloBaileys['fetchLatestBaileysVersion']
        DisconnectReason: ModuloBaileys['DisconnectReason']
      }
      this.modulo = {
        makeWASocket: bail.default,
        useMultiFileAuthState: bail.useMultiFileAuthState,
        fetchLatestBaileysVersion: bail.fetchLatestBaileysVersion,
        DisconnectReason: bail.DisconnectReason,
      }
    }
    this.limparSocket()

    const { state, saveCreds } = await this.modulo.useMultiFileAuthState(this.opcoes.authDir)
    const version = await this.obterVersao()
    const sock = this.modulo.makeWASocket({
      ...(version ? { version } : {}),
      auth: state,
      logger: this.deps.logger,
      browser: [this.opcoes.browser, 'Chrome', '1.0.0'],
      keepAliveIntervalMs: 25_000,
      connectTimeoutMs: 60_000,
      markOnlineOnConnect: true,
    })
    this.sock = sock

    if (this.opcoes.usePairing && this.opcoes.phone && !sock.authState.creds.registered) {
      const telefone = this.opcoes.phone.replace(/\D/g, '')
      setTimeout(() => {
        sock
          .requestPairingCode(telefone)
          .then((code) => this.deps.logger.info({ code }, 'código de pareamento do WhatsApp'))
          .catch((e) => this.deps.logger.error({ err: e }, 'falha ao gerar pairing code'))
      }, 3_000)
    }

    sock.ev.on('creds.update', () => {
      void saveCreds()
    })
    sock.ev.on('connection.update', (u) => {
      void this.aoAtualizarConexao(u)
    })
    sock.ev.on('messages.upsert', ({ messages }) => {
      void this.aoReceber(messages)
    })
  }

  private async aoAtualizarConexao(u: AtualizacaoConexao): Promise<void> {
    if (u.qr) {
      await gravarSessao(this.deps.pool, { status: 'aguardando_qr', qr: u.qr }).catch((e) =>
        this.deps.logger.error({ err: e }, 'falha ao gravar QR na sessão'),
      )
      await this.salvarQrPng(u.qr)
      this.deps.logger.info('novo QR para parear o WhatsApp (veja a tela de admin ou qr.png)')
    }

    if (u.connection === 'open') {
      this.backoff.tentativas = 0
      this.conectado = true
      this.numero = this.sock?.user?.id?.split(':')[0]
      await gravarSessao(this.deps.pool, {
        status: 'conectado',
        numero: this.numero ?? null,
        qr: null,
      }).catch(() => undefined)
      try {
        await this.sock?.sendPresenceUpdate('available')
      } catch {
        /* presença é best-effort */
      }
      this.deps.logger.info({ numero: this.numero }, 'WhatsApp conectado')
    } else if (u.connection === 'close') {
      this.conectado = false
      const code = (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
        ?.statusCode
      await gravarSessao(this.deps.pool, { status: 'desconectado' }).catch(() => undefined)
      this.tratarDesconexao(code)
    }
  }

  private tratarDesconexao(code: number | undefined): void {
    if (this.parado || !this.modulo) return
    const acao = classificarDesconexao(code, this.modulo.DisconnectReason)
    this.deps.logger.warn({ code, acao }, 'conexão do WhatsApp fechada')
    switch (acao) {
      case 'limpar_sessao':
        this.limparSessao()
        this.backoff.tentativas = 0
        this.agendarReconexao(0)
        break
      case 'reconectar_ja':
        this.backoff.tentativas = 0
        this.agendarReconexao(0)
        break
      case 'reconectar_espera':
        this.agendarReconexao(calcularBackoff(this.backoff, 5_000))
        break
      default:
        this.agendarReconexao(calcularBackoff(this.backoff))
    }
  }

  private agendarReconexao(espera: number): void {
    if (this.parado || this.reconectando) return
    this.reconectando = true
    setTimeout(() => {
      this.reconectando = false
      this.abrir().catch((e) => {
        this.deps.logger.error({ err: e }, 'erro ao reconectar ao WhatsApp')
        this.agendarReconexao(calcularBackoff(this.backoff))
      })
    }, espera)
  }

  private async aoReceber(messages: MensagemWA[]): Promise<void> {
    for (const m of messages) {
      if (!m.message) continue
      if (!m.key.fromMe) {
        try {
          await this.sock?.readMessages([m.key]) // tiquinho azul (comportamento humano)
        } catch {
          /* best-effort */
        }
      }
      const evento = extrairBotao(m)
      if (evento) {
        for (const handler of this.handlers) {
          await handler(evento).catch((e) =>
            this.deps.logger.error({ err: e }, 'erro ao processar botão do inbound'),
          )
        }
        continue
      }
      // Não é botão: pode ser a 1ª mensagem do convite (número) ou fallback numerado (E5).
      const eventoTexto = extrairTexto(m)
      if (!eventoTexto) continue
      for (const handler of this.handlersTexto) {
        await handler(eventoTexto).catch((e) =>
          this.deps.logger.error({ err: e }, 'erro ao processar texto do inbound'),
        )
      }
    }
  }

  private limparSocket(): void {
    if (!this.sock) return
    try {
      this.sock.ev.removeAllListeners()
    } catch {
      /* ignora */
    }
    try {
      this.sock.ws?.close()
    } catch {
      /* ignora */
    }
    try {
      this.sock.end?.(undefined)
    } catch {
      /* ignora */
    }
    this.sock = null
  }

  private limparSessao(): void {
    try {
      rmSync(this.opcoes.authDir, { recursive: true, force: true })
      this.deps.logger.warn('sessão do WhatsApp removida; será preciso reescanear o QR')
    } catch (e) {
      this.deps.logger.error({ err: e }, 'falha ao limpar a sessão do WhatsApp')
    }
  }

  private async salvarQrPng(qr: string): Promise<void> {
    try {
      const escritor = exigir('qrcode') as EscritorQr
      await escritor.toFile(join(this.opcoes.authDir, '..', 'qr.png'), qr, { width: 512, margin: 2 })
    } catch {
      /* qr.png é só conveniência local; o QR também vai pro banco */
    }
  }
}
