// Cliente HTTP fino sobre o `fetch` nativo (sem lib nova) para a Graph API da Meta.
// Centraliza a base de URL, o Bearer token, timeout e o parse do envelope de erro.
// NUNCA loga o token nem o corpo (PII): só repassa o erro classificado ao chamador.
import { ErroEnvio } from '../whats'
import { classificarErroGraph } from './erros'
import type { ErroGraph, OpcoesMeta, RespostaEnvioGraph } from './tipos'

const TIMEOUT_MS = 20_000

const base = (o: OpcoesMeta): string => `${o.graphUrl.replace(/\/+$/, '')}/${o.apiVersion}`

async function comTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

/** POST /{phone_number_id}/messages. Retorna o wamid; lança ErroEnvio classificado. */
export async function enviarGraph(o: OpcoesMeta, body: unknown): Promise<{ wamid: string }> {
  const url = `${base(o)}/${o.phoneNumberId}/messages`
  let resp: Response
  try {
    resp = await comTimeout(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${o.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) {
    // rede/timeout/abort: transitório (o drainer reagenda).
    throw new ErroEnvio(0, e instanceof Error ? e.message : 'falha de rede no Graph', false)
  }
  const json = (await resp.json().catch(() => ({}))) as RespostaEnvioGraph
  if (!resp.ok || json.error) {
    const err = json.error ?? {}
    throw classificarErroGraph(err.code, err.message ?? `http ${resp.status}`, resp.status)
  }
  const wamid = json.messages?.[0]?.id
  if (!wamid) throw new ErroEnvio(0, 'envio sem id de mensagem', false)
  return { wamid }
}

/** GET /{phone_number_id}: valida token/phone_id e descobre o número de exibição. */
export async function saudeGraph(o: OpcoesMeta): Promise<{ numero?: string }> {
  const url = `${base(o)}/${o.phoneNumberId}?fields=display_phone_number,verified_name`
  const resp = await comTimeout(url, { headers: { Authorization: `Bearer ${o.accessToken}` } })
  const json = (await resp.json().catch(() => ({}))) as {
    display_phone_number?: string
    error?: ErroGraph
  }
  if (!resp.ok || json.error) {
    const err = json.error ?? {}
    throw classificarErroGraph(err.code, err.message ?? `http ${resp.status}`, resp.status)
  }
  return { numero: json.display_phone_number ? json.display_phone_number.replace(/\D/g, '') : undefined }
}
