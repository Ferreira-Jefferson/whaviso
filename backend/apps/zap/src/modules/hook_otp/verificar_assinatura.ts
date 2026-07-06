import { createHmac, timingSafeEqual } from 'node:crypto'

// Verificação de assinatura do Send SMS Hook do Supabase (padrão Standard Webhooks).
// O Supabase assina `${webhook-id}.${webhook-timestamp}.${corpo}` com HMAC-SHA256
// usando o segredo (base64 após tirar o prefixo `v1,whsec_`), e manda a assinatura
// no header `webhook-signature` como lista separada por espaço de `v1,<base64>`.

interface CabecalhosWebhook {
  id: string | undefined
  timestamp: string | undefined
  assinatura: string | undefined
}

// Tolerância de frescor do webhook-timestamp (padrão Standard Webhooks): rejeita fora
// de +-5 min, cortando replay de um payload assinado capturado (o timestamp entra no
// conteúdo assinado, então não pode ser adulterado sem invalidar a assinatura).
const TOLERANCIA_TIMESTAMP_S = 5 * 60

function chaveDoSegredo(secret: string): Buffer {
  const base64 = secret.replace(/^v1,/, '').replace(/^whsec_/, '')
  return Buffer.from(base64, 'base64')
}

function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}

/**
 * Confere a assinatura Standard Webhooks. `rawBody` são os bytes exatos do corpo.
 * Retorna true só se alguma das assinaturas `v1,...` do header conferir.
 */
export function assinaturaValida(
  rawBody: Buffer,
  cab: CabecalhosWebhook,
  secret: string,
): boolean {
  if (!cab.id || !cab.timestamp || !cab.assinatura) return false

  // Frescor: o timestamp (Unix em segundos) precisa estar dentro da janela de tolerância.
  const ts = Number(cab.timestamp)
  if (!Number.isFinite(ts)) return false
  const agoraS = Math.floor(Date.now() / 1000)
  if (Math.abs(agoraS - ts) > TOLERANCIA_TIMESTAMP_S) return false

  const conteudo = `${cab.id}.${cab.timestamp}.${rawBody.toString('utf8')}`
  const esperado = createHmac('sha256', chaveDoSegredo(secret)).update(conteudo).digest('base64')

  // O header pode trazer várias assinaturas: "v1,aaa v1,bbb". Basta uma conferir.
  return cab.assinatura
    .split(' ')
    .map((parte) => parte.split(',', 2)[1] ?? '')
    .some((sig) => sig.length > 0 && igual(sig, esperado))
}
