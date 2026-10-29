// Implementacao real de ClienteWhats (contrato F2) sobre a Meta Cloud API oficial, em modo
// multi-numero: a credencial (token) e o phone_number_id chegam POR CHAMADA dentro de
// `numero` (NumeroWhats), nunca ficam fixos no cliente. O token so e revelado no header
// Authorization, no instante do envio; nunca e logado nem sai num erro (SEC-024).
//
// Este modulo e BIBLIOTECA de transporte: nao agenda, nao retenta, nao toca banco. Quem
// decide retry le o ErroProvedor tipado (ZAP-enviar); quem recebe HTTP e ZAP-webhook.
import type { ZodType } from 'zod'
import {
  BaixarMidiaEntrada,
  EnviarInterativoEntrada,
  EnviarMidiaEntrada,
  EnviarTemplateAutenticacaoEntrada,
  EnviarTemplateEntrada,
  EnviarTextoEntrada,
  MarcarLidaEntrada,
  Permanente,
  POLITICA_WHATS,
  falha,
  ok,
  verificarAssinaturaHmac,
  type ClienteWhats,
  type EnvioWhats,
  type HostPermitido,
  type MidiaBaixada,
  type NumeroWhats,
  type ResolverDns,
  type ResultadoWhats,
} from '@whaviso/shared/clientes'
import {
  GRAPH_API_VERSION_PADRAO,
  GRAPH_HOST_PADRAO,
  HOSTS_MIDIA_PADRAO,
  MAX_MIDIA_BYTES_PADRAO,
} from './config'
import {
  corpoInterativo,
  corpoMarcarLida,
  corpoMidia,
  corpoTemplate,
  corpoTemplateAutenticacao,
  corpoTexto,
} from './corpos'
import { requisicaoGraph, retryAposMs, urlGraph, type ContextoGraph } from './graph_api'
import { mapearErroMeta, normalizarExcecao } from './mapa_erros'

export interface OpcoesClienteMeta {
  /** App Secret da Meta (um por app), usado so para validar a assinatura do webhook. */
  appSecret: string
  /** Versao da Graph API; default GRAPH_API_VERSION_PADRAO (promover a env). */
  apiVersion?: string
  /** Host do Graph (allowlist SSRF); default graph.facebook.com. */
  graphHost?: string
  /** Hosts da CDN de midia (download); default lookaside.fbsbx.com e *.fbcdn.net. */
  hostsMidia?: readonly HostPermitido[]
  /** Teto da midia baixada em bytes. */
  maxMidiaBytes?: number
  /** Timeout por requisicao; default POLITICA_WHATS.timeoutMs. */
  timeoutMs?: number
  /** Injecao para testes (sem rede real). */
  fetchImpl?: typeof fetch
  resolverDns?: ResolverDns
}

interface RespostaEnvio {
  messages?: Array<{ id?: string }>
  error?: { code?: number }
}
interface RespostaMidia {
  url?: string
  mime_type?: string
  error?: { code?: number }
}

const entradaInvalida = (): Permanente => new Permanente('entrada invalida', { codigo: 'entrada_invalida' })

/** Valida a entrada no limite do cliente; devolve os dados ja normalizados ou undefined. */
function validar<T>(schema: ZodType<T>, entrada: unknown): T | undefined {
  const r = schema.safeParse(entrada)
  return r.success ? r.data : undefined
}

export function criarClienteWhatsMeta(opcoes: OpcoesClienteMeta): ClienteWhats {
  const host = opcoes.graphHost ?? GRAPH_HOST_PADRAO
  const hostsGraph: readonly HostPermitido[] = [host]
  const hostsMidia = opcoes.hostsMidia ?? HOSTS_MIDIA_PADRAO
  const maxMidiaBytes = opcoes.maxMidiaBytes ?? MAX_MIDIA_BYTES_PADRAO
  const ctx: ContextoGraph = {
    host,
    apiVersion: opcoes.apiVersion ?? GRAPH_API_VERSION_PADRAO,
    timeoutMs: opcoes.timeoutMs ?? POLITICA_WHATS.timeoutMs,
    fetchImpl: opcoes.fetchImpl,
    resolverDns: opcoes.resolverDns,
  }

  const urlMensagens = (numero: NumeroWhats): string => urlGraph(ctx, `${numero.phoneNumberId}/messages`)

  /** POST /{phone_number_id}/messages e extrai o wamid, roteando pela credencial do numero. */
  async function enviarCorpo(numero: NumeroWhats, corpo: unknown): ResultadoWhats<EnvioWhats> {
    let resp: Response
    try {
      resp = await requisicaoGraph(ctx, {
        url: urlMensagens(numero),
        token: numero.credencial.revelar(),
        metodo: 'POST',
        body: corpo,
        hostsPermitidos: hostsGraph,
      })
    } catch (e) {
      return falha(normalizarExcecao(e))
    }
    const json = (await resp.json().catch(() => ({}))) as RespostaEnvio
    if (!resp.ok || json.error) return falha(mapearErroMeta(json.error?.code, resp.status, retryAposMs(resp)))
    const wamid = json.messages?.[0]?.id
    if (!wamid) return falha(new Permanente('resposta sem wamid', { codigo: 'sem_wamid' }))
    return ok({ wamid })
  }

  async function baixarMidia(entrada: unknown): ResultadoWhats<MidiaBaixada> {
    const v = validar(BaixarMidiaEntrada, entrada)
    if (!v) return falha(entradaInvalida())
    const token = v.numero.credencial.revelar()
    // Passo 1: metadados da midia (url temporaria assinada + mime), no host do Graph.
    let meta: RespostaMidia
    try {
      const resp = await requisicaoGraph(ctx, {
        url: urlGraph(ctx, v.mediaId),
        token,
        metodo: 'GET',
        hostsPermitidos: hostsGraph,
      })
      meta = (await resp.json().catch(() => ({}))) as RespostaMidia
      if (!resp.ok || meta.error) return falha(mapearErroMeta(meta.error?.code, resp.status, retryAposMs(resp)))
    } catch (e) {
      return falha(normalizarExcecao(e))
    }
    if (!meta.url) return falha(new Permanente('midia sem url', { codigo: 'midia_sem_url' }))
    // Passo 2: baixa o binario da CDN (outro host na allowlist), com o mesmo token.
    try {
      const resp = await requisicaoGraph(ctx, {
        url: meta.url,
        token,
        metodo: 'GET',
        hostsPermitidos: hostsMidia,
      })
      if (!resp.ok) return falha(mapearErroMeta(undefined, resp.status, retryAposMs(resp)))
      const declarado = Number(resp.headers.get('content-length'))
      if (Number.isFinite(declarado) && declarado > maxMidiaBytes) {
        return falha(new Permanente('midia excede o limite', { codigo: 'midia_grande' }))
      }
      const bytes = new Uint8Array(await resp.arrayBuffer())
      if (bytes.byteLength > maxMidiaBytes) {
        return falha(new Permanente('midia excede o limite', { codigo: 'midia_grande' }))
      }
      const mimeType = meta.mime_type ?? resp.headers.get('content-type') ?? 'application/octet-stream'
      return ok({ bytes, mimeType })
    } catch (e) {
      return falha(normalizarExcecao(e))
    }
  }

  async function marcarLida(entrada: unknown): ResultadoWhats<void> {
    const v = validar(MarcarLidaEntrada, entrada)
    if (!v) return falha(entradaInvalida())
    let resp: Response
    try {
      resp = await requisicaoGraph(ctx, {
        url: urlMensagens(v.numero),
        token: v.numero.credencial.revelar(),
        metodo: 'POST',
        body: corpoMarcarLida(v.wamid),
        hostsPermitidos: hostsGraph,
      })
    } catch (e) {
      return falha(normalizarExcecao(e))
    }
    const json = (await resp.json().catch(() => ({}))) as RespostaEnvio
    if (!resp.ok || json.error) return falha(mapearErroMeta(json.error?.code, resp.status, retryAposMs(resp)))
    return ok(undefined)
  }

  return {
    enviarTexto: (entrada) => {
      const v = validar(EnviarTextoEntrada, entrada)
      return v ? enviarCorpo(v.numero, corpoTexto(v)) : Promise.resolve(falha(entradaInvalida()))
    },
    enviarTemplate: (entrada) => {
      const v = validar(EnviarTemplateEntrada, entrada)
      return v ? enviarCorpo(v.numero, corpoTemplate(v)) : Promise.resolve(falha(entradaInvalida()))
    },
    enviarTemplateAutenticacao: (entrada) => {
      const v = validar(EnviarTemplateAutenticacaoEntrada, entrada)
      return v
        ? enviarCorpo(v.numero, corpoTemplateAutenticacao(v))
        : Promise.resolve(falha(entradaInvalida()))
    },
    enviarInterativo: (entrada) => {
      const v = validar(EnviarInterativoEntrada, entrada)
      return v ? enviarCorpo(v.numero, corpoInterativo(v)) : Promise.resolve(falha(entradaInvalida()))
    },
    enviarMidia: (entrada) => {
      const v = validar(EnviarMidiaEntrada, entrada)
      return v ? enviarCorpo(v.numero, corpoMidia(v)) : Promise.resolve(falha(entradaInvalida()))
    },
    baixarMidia,
    marcarLida,
    verificarAssinatura: (rawBody, header) => verificarAssinaturaHmac(rawBody, header, opcoes.appSecret),
  }
}
