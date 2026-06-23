// Tipagem mínima do fork @rexxhayanasi/elaina-baileys. O pacote declara um
// `types` que não existe no tarball, então tipamos aqui só o que usamos e
// carregamos o módulo por createRequire (ver conexao.ts).

export interface ChaveWA {
  id?: string | null
  remoteJid?: string | null
  fromMe?: boolean | null
}

export interface ConteudoWA {
  conversation?: string | null
  extendedTextMessage?: { text?: string | null } | null
  buttonsResponseMessage?: { selectedButtonId?: string | null } | null
  templateButtonReplyMessage?: { selectedId?: string | null } | null
}

export interface MensagemWA {
  key: ChaveWA
  message?: ConteudoWA | null
}

export interface AtualizacaoConexao {
  connection?: string
  lastDisconnect?: { error?: unknown } | null
  qr?: string
}

export interface BotaoWA {
  buttonId: string
  buttonText: { displayText: string }
  type: number
}

export interface ConteudoEnvio {
  text?: string
  caption?: string
  image?: { url: string }
  video?: { url: string }
  audio?: { url: string }
  document?: { url: string }
  footer?: string
  buttons?: BotaoWA[]
  headerType?: number
}

export interface SocketWA {
  ev: {
    on(evento: 'creds.update', cb: () => void): void
    on(evento: 'connection.update', cb: (u: AtualizacaoConexao) => void): void
    on(evento: 'messages.upsert', cb: (a: { messages: MensagemWA[] }) => void): void
    removeAllListeners(): void
  }
  ws?: { close(): void }
  end?: (err?: unknown) => void
  user?: { id: string }
  authState: { creds: { registered?: boolean } }
  sendMessage(jid: string, conteudo: ConteudoEnvio, opcoes?: Record<string, unknown>): Promise<MensagemWA | undefined>
  presenceSubscribe(jid: string): Promise<void>
  sendPresenceUpdate(tipo: string, jid?: string): Promise<void>
  readMessages(chaves: ChaveWA[]): Promise<void>
  requestPairingCode(telefone: string): Promise<string>
  logout(motivo?: string): Promise<void>
}

export interface ConfigSocket {
  // opcional: sem versão (rede do fetchLatestBaileysVersion falhou/expirou) o
  // Baileys usa a versão embutida no pacote, sem travar a conexão.
  version?: [number, number, number]
  auth: unknown
  logger?: unknown
  printQRInTerminal?: boolean
  browser: [string, string, string]
  keepAliveIntervalMs?: number
  connectTimeoutMs?: number
  markOnlineOnConnect?: boolean
}

export interface EstadoAuth {
  state: unknown
  saveCreds: () => Promise<void>
}

export interface ModuloBaileys {
  makeWASocket: (config: ConfigSocket) => SocketWA
  useMultiFileAuthState: (dir: string) => Promise<EstadoAuth>
  fetchLatestBaileysVersion: () => Promise<{ version: [number, number, number] }>
  DisconnectReason: Record<string, number>
}
