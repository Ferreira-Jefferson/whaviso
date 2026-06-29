// Valida a assinatura do webhook da Meta: header `X-Hub-Signature-256: sha256=<hex>`,
// HMAC-SHA256 do corpo CRU (rawBody) com o App Secret. Diferente do Send SMS Hook do
// Supabase (Standard Webhooks, base64, id.timestamp.body); aqui é só o corpo, em hex.
import { createHmac, timingSafeEqual } from 'node:crypto'

export function assinaturaMetaValida(
  rawBody: Buffer,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!header || !appSecret) return false
  const recebido = header.startsWith('sha256=') ? header.slice('sha256='.length) : header
  const esperadoHex = createHmac('sha256', appSecret).update(rawBody).digest('hex')
  let a: Buffer
  let b: Buffer
  try {
    a = Buffer.from(recebido, 'hex')
    b = Buffer.from(esperadoHex, 'hex')
  } catch {
    return false
  }
  if (a.length !== b.length || a.length === 0) return false
  return timingSafeEqual(a, b)
}
