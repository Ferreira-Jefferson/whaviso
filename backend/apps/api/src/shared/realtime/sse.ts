// Formato de fio SSE (F5). JSON.stringify nunca emite quebra de linha: seguro como `data:`.
import type { MensagemHub } from './hub'

export const HEARTBEAT = ': hb\n\n'
export const ABERTURA = 'retry: 3000\n\n'

export function formatarMensagem(msg: MensagemHub): string {
  switch (msg.tipo) {
    case 'evento':
      return `id: ${msg.id}\nevent: ${msg.evento.tipo}\ndata: ${JSON.stringify(msg.evento)}\n\n`
    case 'resync':
      return `event: resync\ndata: ${JSON.stringify({ motivo: msg.motivo })}\n\n`
    case 'fim':
      return `event: fim\ndata: ${JSON.stringify({ motivo: msg.motivo })}\n\n`
  }
}

/** Le `exp` (segundos) do payload do JWT ja VERIFICADO por `autenticar`. null se ausente. */
export function lerExpDoBearer(authorization: string | undefined): number | null {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
  const parte = token?.split('.')[1]
  if (!parte) return null
  try {
    const exp = (JSON.parse(Buffer.from(parte, 'base64url').toString('utf8')) as { exp?: unknown }).exp
    return typeof exp === 'number' && Number.isFinite(exp) ? exp : null
  } catch {
    return null
  }
}
