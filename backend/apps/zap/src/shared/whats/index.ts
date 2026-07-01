// Contrato público do transporte WhatsApp, neutro de provedor. Os módulos do zap
// dependem só disto; a implementação concreta (Meta Cloud API) fica encapsulada em
// shared/meta_client. Quem produz a MensagemWhats (scheduler/webhook) já renderizou o
// template; o transporte só traduz a estrutura para o canal.

export interface BotaoZap {
  /** payload que volta no inbound; ex.: "ja_paguei:<avisoId>". */
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
 * Descritor de TEMPLATE aprovado na Meta. Quando presente em MensagemWhats, o
 * transporte envia por template (mensagem que INICIA conversa, fora da janela de
 * 24h); ausente, manda texto/interactive livre (réplica dentro da janela). É decisão
 * de quem produz (drains marcam comoTemplate; réplicas não), não do transporte.
 */
export interface TemplateWhats {
  /** nome do template registrado na Meta (templates.nome_meta). */
  nome: string
  /** código de idioma do template (templates.idioma; ex.: 'pt_BR'). */
  idioma: string
  /** valores na ordem de templates.variaveis, para {{1}}..{{n}} do corpo. */
  parametros: string[]
  /** payload de cada botão quick_reply, na ordem do template (ex.: "ja_paguei:<id>"). */
  botoesPayload?: string[]
  /** template de categoria AUTHENTICATION (OTP): o código (parametros[0]) também vai no
   *  botão. Formato fixo da Meta (sem copy custom); usado só pelo login OTP. */
  autenticacao?: boolean
}

/**
 * Mensagem estruturada que o transporte entende: texto, botões e (opcional) mídia.
 * Com mídia, `texto` vira a legenda. Com `template`, o transporte envia por template
 * aprovado em vez de texto livre. O transporte não conhece regra de negócio.
 */
export interface MensagemWhats {
  para: string
  texto: string
  botoes?: BotaoZap[]
  midia?: MidiaZap
  template?: TemplateWhats
}

export interface EventoBotao {
  wamid: string
  telefone: string
  /** o payload do botão tapado; ex.: "ja_paguei:<avisoId>". */
  buttonId: string
  /** wamid da mensagem original a que este inbound responde (Meta `context.id`); usado
   *  para correlacionar o aviso quando o payload do botão não basta. */
  contextoMsgId?: string
}

/**
 * Mensagem de TEXTO recebida (E5): a 1ª mensagem do convite e o fallback numerado. O
 * transporte só entrega o texto cru; quem interpreta é o módulo (webhook_whatsapp).
 */
export interface EventoTexto {
  wamid: string
  telefone: string
  texto: string
  contextoMsgId?: string
}

/** Recibo de entrega de uma mensagem que enviamos (Meta `statuses[]`). */
export interface EventoStatus {
  wamid: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  erro?: string
}

/**
 * Mudança de status de um TEMPLATE na Meta (webhook `message_template_status_update`):
 * a Meta avisa quando um template submetido é aprovado/rejeitado. Casa por (nome, idioma);
 * `motivo` traz a justificativa da recusa. Quem aplica é o módulo sincronizar_templates.
 */
export interface EventoTemplateStatus {
  /** nome do template na Meta (= templates.nome_meta). */
  nomeMeta: string
  /** idioma do template (= templates.idioma; ex.: 'pt_BR'). */
  idioma: string
  /** veredito já traduzido para o vocabulário do banco (status_meta). */
  status: 'aprovado' | 'rejeitado' | 'pendente'
  /** motivo da recusa, quando rejeitado. */
  motivo?: string
}

export type HandlerBotao = (e: EventoBotao) => Promise<void>
export type HandlerTexto = (e: EventoTexto) => Promise<void>
export type HandlerStatus = (e: EventoStatus) => Promise<void>
export type HandlerTemplateStatus = (e: EventoTemplateStatus) => Promise<void>

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
  desconectar(): Promise<void>
  enviarMensagem(m: MensagemWhats): Promise<{ wamid: string }>
  enviarTexto(para: string, texto: string): Promise<{ wamid: string }>
  onBotao(cb: HandlerBotao): void
  onTexto(cb: HandlerTexto): void
  /** recibos de entrega (sent/delivered/read/failed). No transporte sem suporte, no-op. */
  onStatus(cb: HandlerStatus): void
  /** mudanças de status de template na Meta (aprovado/rejeitado). Sem suporte, no-op. */
  onTemplateStatus(cb: HandlerTemplateStatus): void
  status(): StatusConexao
}
