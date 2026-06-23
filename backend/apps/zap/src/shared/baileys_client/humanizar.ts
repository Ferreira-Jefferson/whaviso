// Humanização do envio: presença "digitando..." por um tempo proporcional ao
// texto antes de mandar. Se a simulação falhar, cai no envio direto (sem travar).
import type { ConteudoEnvio, MensagemWA, SocketWA } from './tipos_fork'

const CPS = 14 // caracteres/segundo digitados (humano médio ~200 cpm)
const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const aleatorio = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min

export async function digitarEEnviar(
  sock: SocketWA,
  jid: string,
  conteudo: ConteudoEnvio,
  humanize: boolean,
): Promise<MensagemWA | undefined> {
  if (!humanize) return sock.sendMessage(jid, conteudo)

  try {
    await sock.presenceSubscribe(jid)
    await dormir(aleatorio(300, 800)) // "perceber/ler" antes de digitar
    await sock.sendPresenceUpdate('composing', jid)

    const base = ((conteudo.text ?? conteudo.caption ?? '').length / CPS) * 1000
    const digitando = Math.min(Math.max(base, 800), 6000) + aleatorio(0, 600)
    await dormir(digitando)

    await sock.sendPresenceUpdate('paused', jid)
    await dormir(aleatorio(150, 400))
    return await sock.sendMessage(jid, conteudo)
  } catch {
    return sock.sendMessage(jid, conteudo) // fallback robusto
  }
}
