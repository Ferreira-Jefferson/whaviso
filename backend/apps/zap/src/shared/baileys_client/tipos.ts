// Contrato público do transporte WhatsApp (Baileys). Os módulos dependem só
// disto; a implementação (socket, reconexão, ritmo) fica encapsulada no pacote.

export interface BotaoZap {
  /** vai como buttonId no WhatsApp e volta no inbound; ex.: "ja_paguei:<avisoId>". */
  id: string
  /** texto exibido no botão. */
  rotulo: string
}

export type TipoMidia = 'imagem' | 'video' | 'audio' | 'documento'

export interface MidiaZap {
  tipo: TipoMidia
  /** URL pública do arquivo; o transporte repassa ao WhatsApp. */
  url: string
}

/**
 * Mensagem estruturada que o transporte entende: texto, botões e (opcional) mídia.
 * Quem produz isto (scheduler/webhook) já renderizou o template; o transporte só
 * traduz a estrutura para o canal (Baileys hoje, Meta depois). Com mídia, `texto`
 * vira a legenda. O transporte não conhece regra de negócio nem variáveis.
 */
export interface MensagemWhats {
  para: string
  texto: string
  botoes?: BotaoZap[]
  midia?: MidiaZap
}

export interface EventoBotao {
  wamid: string
  telefone: string
  /** o buttonId tapado; ex.: "ja_paguei:<avisoId>". */
  buttonId: string
}

/**
 * Mensagem de TEXTO recebida do convidado (E5): a 1ª mensagem com o número de convite
 * ("Oi, aqui é fulano, meu convite é o xxx-xxx") e o fallback numerado (1/2/3) quando os
 * botões interativos do Baileys não chegam. O transporte só entrega o texto cru; quem
 * extrai o número / interpreta o fallback é o módulo (webhook_whatsapp). Texto livre que
 * não seja convite/fallback é ignorado pela regra de negócio (devedor só age por botão).
 */
export interface EventoTexto {
  wamid: string
  telefone: string
  texto: string
}

export type HandlerBotao = (e: EventoBotao) => Promise<void>
export type HandlerTexto = (e: EventoTexto) => Promise<void>

export interface StatusConexao {
  conectado: boolean
  numero?: string
}

/** Erro de envio classificável (permanente nunca é re-tentado pelo drainer). */
export class ErroEnvio extends Error {
  constructor(
    public readonly codigo: number,
    message: string,
    public readonly permanente: boolean,
  ) {
    super(message)
    this.name = 'ErroEnvio'
  }
}

export interface ClienteWhats {
  conectar(): Promise<void>
  parar(): Promise<void>
  /** logout + apaga a sessão local: a próxima conexão exige escanear um QR novo. */
  desconectar(): Promise<void>
  enviarMensagem(m: MensagemWhats): Promise<{ wamid: string }>
  enviarTexto(para: string, texto: string): Promise<{ wamid: string }>
  onBotao(cb: HandlerBotao): void
  onTexto(cb: HandlerTexto): void
  status(): StatusConexao
}

export interface OpcoesWhats {
  authDir: string
  phone?: string
  usePairing: boolean
  browser: string
  humanize: boolean
  dryRun: boolean
  gapMin: number
  gapMax: number
  batchSize: number
  batchPauseMin: number
  batchPauseMax: number
  maxPorHora: number
}
