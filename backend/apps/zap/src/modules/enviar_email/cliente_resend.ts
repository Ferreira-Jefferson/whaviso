// Cliente de e-mail transacional atras de uma interface (espelha o isolamento do ClienteWhats /
// meta_client): trocar de provedor ou detalhe do transporte fica pontual. Implementacao real: Resend
// (POST https://api.resend.com/emails) via fetchSeguro (SEC-070: HTTPS, allowlist de host, sem
// redirect p/ rede interna). A chave da API NUNCA e logada; o e-mail do destinatario nao vai para
// log (so o provider_id e o codigo de erro). Host fixo (nao e entrada do usuario).
import { fetchSeguro } from '@whaviso/shared/clientes'
import type { Logger } from '@whaviso/shared/logger'

export interface EmailParaEnviar {
  para: string
  assunto: string
  texto: string
}

export type ResultadoEmail =
  | { ok: true; providerId: string }
  | { ok: false; erro: { codigo: string; retentavel: boolean } }

/** Fronteira do provedor de e-mail. O drainer so conhece isto. */
export interface ClienteEmail {
  enviar(msg: EmailParaEnviar): Promise<ResultadoEmail>
}

export interface OpcoesClienteResend {
  apiKey: string
  /** Remetente no formato "Nome <endereco@dominio>" ou so o endereco. */
  remetente: string
  logger: Logger
  /** injecao p/ teste; default o fetch global. */
  fetchImpl?: typeof fetch
  endpoint?: string
}

const ENDPOINT_PADRAO = 'https://api.resend.com/emails'

/** Cria o cliente Resend. Sem apiKey nao da p/ construir (o boot decide ficar idle). */
export function criarClienteResend(op: OpcoesClienteResend): ClienteEmail {
  const endpoint = op.endpoint ?? ENDPOINT_PADRAO
  const host = new URL(endpoint).hostname
  return {
    async enviar(msg: EmailParaEnviar): Promise<ResultadoEmail> {
      let resp: Response
      try {
        resp = await fetchSeguro(endpoint, {
          hostsPermitidos: [host],
          fetchImpl: op.fetchImpl,
          init: {
            method: 'POST',
            headers: {
              authorization: `Bearer ${op.apiKey}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              from: op.remetente,
              to: [msg.para],
              subject: msg.assunto,
              text: msg.texto,
            }),
          },
        })
      } catch {
        // Falha de rede/transporte: retentavel (sem detalhe no log; o chamador decide o backoff).
        return { ok: false, erro: { codigo: 'rede', retentavel: true } }
      }
      if (resp.ok) {
        const corpo = (await resp.json().catch(() => ({}))) as { id?: string }
        return { ok: true, providerId: corpo.id ?? '' }
      }
      // 429 e 5xx sao transitorios; demais 4xx sao permanentes (credencial/remetente/destino ruim).
      const retentavel = resp.status === 429 || resp.status >= 500
      op.logger.warn({ status: resp.status, retentavel }, 'envio de e-mail recusado pelo provedor')
      return { ok: false, erro: { codigo: `http_${resp.status}`, retentavel } }
    },
  }
}
