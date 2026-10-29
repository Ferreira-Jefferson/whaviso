import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { TelefoneE164 } from '../contracts/primitivos'
import { CredencialResolvidaSchema, type ErroProvedor, type Resultado } from './erros'

// Fronteira ClienteWhats (transporte WhatsApp, multi-WABA, credencial por numero).
//
// REGRA DA JANELA DE 24H: e responsabilidade do CHAMADOR (zap/outbox) decidir entre texto
// livre e template. O cliente nao decide nada: se o provedor recusar por janela expirada,
// apenas reporta `JanelaExpirada` (retry nao ajuda; o chamador troca para template).

/** Numero remetente: phone_number_id + credencial ja resolvida pelo chamador. */
export const NumeroWhats = z
  .object({
    phoneNumberId: z.string().min(1).max(64),
    credencial: CredencialResolvidaSchema,
  })
  .strict()
export type NumeroWhats = z.infer<typeof NumeroWhats>

// `rastreio` vira o biz_opaque_callback_data (nivel de mensagem) na Cloud API: um rotulo
// opaco que a Meta devolve no webhook de status. O chamador passa o id do envio para
// reconciliar entrega/leitura com a linha da outbox (max 512 na Cloud API; nao e PII).
const Base = { numero: NumeroWhats, para: TelefoneE164, rastreio: z.string().max(512).optional() }

export const EnviarTextoEntrada = z
  .object({ ...Base, texto: z.string().min(1).max(4096), previewUrl: z.boolean().optional() })
  .strict()
export type EnviarTextoEntrada = z.infer<typeof EnviarTextoEntrada>

export const EnviarTemplateEntrada = z
  .object({
    ...Base,
    nome: z.string().min(1).max(512),
    idioma: z.string().min(2).max(16),
    componentes: z
      .array(z.object({ tipo: z.enum(['header', 'body', 'button']), parametros: z.array(z.string().max(1024)) }).strict())
      .default([]),
  })
  .strict()
export type EnviarTemplateEntrada = z.input<typeof EnviarTemplateEntrada>

const Botao = z.object({ id: z.string().min(1).max(256), titulo: z.string().min(1).max(20) }).strict()
const Linha = z
  .object({ id: z.string().min(1).max(200), titulo: z.string().min(1).max(24), descricao: z.string().max(72).optional() })
  .strict()

export const EnviarInterativoEntrada = z
  .object({
    ...Base,
    corpo: z.string().min(1).max(1024),
    interacao: z.discriminatedUnion('tipo', [
      z.object({ tipo: z.literal('botoes'), botoes: z.array(Botao).min(1).max(3) }).strict(),
      z
        .object({
          tipo: z.literal('lista'),
          rotuloBotao: z.string().min(1).max(20),
          secoes: z
            .array(z.object({ titulo: z.string().max(24).optional(), linhas: z.array(Linha).min(1).max(10) }).strict())
            .min(1)
            .max(10),
        })
        .strict(),
    ]),
  })
  .strict()
export type EnviarInterativoEntrada = z.infer<typeof EnviarInterativoEntrada>

export const EnviarMidiaEntrada = z
  .object({
    ...Base,
    tipo: z.enum(['image', 'audio', 'document', 'video']),
    /** Exatamente um: mediaId ja carregado no provedor, ou url publica HTTPS. */
    mediaId: z.string().min(1).optional(),
    url: z.url({ protocol: /^https$/ }).optional(),
    legenda: z.string().max(1024).optional(),
    nomeArquivo: z.string().max(240).optional(),
  })
  .strict()
  .refine((v) => (v.mediaId === undefined) !== (v.url === undefined), 'informe mediaId OU url')
export type EnviarMidiaEntrada = z.infer<typeof EnviarMidiaEntrada>

export const BaixarMidiaEntrada = z.object({ numero: NumeroWhats, mediaId: z.string().min(1) }).strict()
export type BaixarMidiaEntrada = z.infer<typeof BaixarMidiaEntrada>

export const MarcarLidaEntrada = z.object({ numero: NumeroWhats, wamid: z.string().min(1) }).strict()
export type MarcarLidaEntrada = z.infer<typeof MarcarLidaEntrada>

export const EnvioWhats = z.object({ wamid: z.string().min(1) }).strict()
export type EnvioWhats = z.infer<typeof EnvioWhats>

export interface MidiaBaixada {
  bytes: Uint8Array
  mimeType: string
}

export type ResultadoWhats<T> = Promise<Resultado<T, ErroProvedor>>

export interface ClienteWhats {
  enviarTexto(entrada: EnviarTextoEntrada): ResultadoWhats<EnvioWhats>
  enviarTemplate(entrada: EnviarTemplateEntrada): ResultadoWhats<EnvioWhats>
  enviarInterativo(entrada: EnviarInterativoEntrada): ResultadoWhats<EnvioWhats>
  enviarMidia(entrada: EnviarMidiaEntrada): ResultadoWhats<EnvioWhats>
  baixarMidia(entrada: BaixarMidiaEntrada): ResultadoWhats<MidiaBaixada>
  marcarLida(entrada: MarcarLidaEntrada): ResultadoWhats<void>
  /** Valida a assinatura do webhook (X-Hub-Signature-256) sobre o corpo CRU. */
  verificarAssinatura(rawBody: string | Uint8Array, header: string | undefined): boolean
}

/** HMAC-SHA256 "sha256=<hex>" em tempo constante. Util para as implementacoes e o fake. */
export function verificarAssinaturaHmac(
  rawBody: string | Uint8Array,
  header: string | undefined,
  segredo: string,
): boolean {
  if (!header?.startsWith('sha256=')) return false
  const esperado = createHmac('sha256', segredo).update(rawBody).digest()
  const recebidoHex = header.slice('sha256='.length)
  if (!/^[0-9a-f]{64}$/i.test(recebidoHex)) return false
  return timingSafeEqual(esperado, Buffer.from(recebidoHex, 'hex'))
}
