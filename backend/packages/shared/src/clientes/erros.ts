import { z } from 'zod'

// Erros e utilitarios comuns das fronteiras de provedor externo (WhatsApp, LLM, mapas).
// O erro tipado e o que permite ao chamador decidir retry (ex.: outbox do zap).

export type TipoErroProvedor =
  | 'JanelaExpirada'
  | 'TemplateNaoAprovado'
  | 'RateLimit'
  | 'Transitorio'
  | 'Permanente'

export interface ErroProvedorOpcoes {
  /** Codigo estavel do provedor/erro (nunca dado sensivel). */
  codigo?: string
  causa?: unknown
}

export class ErroProvedor extends Error {
  readonly tipo: TipoErroProvedor
  readonly codigo: string
  /** Pode valer a pena tentar de novo? Decisao de dados, nao de quem chama. */
  readonly retentavel: boolean

  constructor(tipo: TipoErroProvedor, mensagem: string, retentavel: boolean, op: ErroProvedorOpcoes = {}) {
    super(mensagem, op.causa === undefined ? undefined : { cause: op.causa })
    this.name = tipo
    this.tipo = tipo
    this.codigo = op.codigo ?? tipo
    this.retentavel = retentavel
  }
}

/** Fora da janela de 24h: o chamador deve usar template (a regra da janela e dele). */
export class JanelaExpirada extends ErroProvedor {
  constructor(mensagem = 'janela de 24h expirada', op?: ErroProvedorOpcoes) {
    super('JanelaExpirada', mensagem, false, op)
  }
}

export class TemplateNaoAprovado extends ErroProvedor {
  constructor(mensagem = 'template nao aprovado', op?: ErroProvedorOpcoes) {
    super('TemplateNaoAprovado', mensagem, false, op)
  }
}

export class RateLimit extends ErroProvedor {
  readonly retryAposMs: number | undefined
  constructor(mensagem = 'limite de taxa atingido', retryAposMs?: number, op?: ErroProvedorOpcoes) {
    super('RateLimit', mensagem, true, op)
    this.retryAposMs = retryAposMs
  }
}

export class Transitorio extends ErroProvedor {
  constructor(mensagem = 'falha transitoria do provedor', op?: ErroProvedorOpcoes) {
    super('Transitorio', mensagem, true, op)
  }
}

export class Permanente extends ErroProvedor {
  constructor(mensagem = 'falha permanente do provedor', op?: ErroProvedorOpcoes) {
    super('Permanente', mensagem, false, op)
  }
}

/** Bloqueio de SSRF por fetchSeguro (host fora da allowlist, HTTP, rede privada). */
export class ErroSsrf extends Permanente {
  constructor(mensagem: string) {
    super(mensagem, { codigo: 'ssrf_bloqueado' })
    this.name = 'ErroSsrf'
  }
}

export type Resultado<T, E = ErroProvedor> = { ok: true; valor: T } | { ok: false; erro: E }

export const ok = <T>(valor: T): Resultado<T, never> => ({ ok: true, valor })
export const falha = <E>(erro: E): Resultado<never, E> => ({ ok: false, erro })

/** Retry como dado: cada cliente declara sua politica, nada de numero magico espalhado. */
export const PoliticaRetry = z
  .object({
    maxTentativas: z.number().int().min(1).max(10),
    baseMs: z.number().int().min(0),
    fator: z.number().min(1),
    maxMs: z.number().int().min(0),
    /** 0..1: fracao aleatoria somada ao atraso. */
    jitter: z.number().min(0).max(1),
  })
  .strict()
export type PoliticaRetry = z.infer<typeof PoliticaRetry>

export const PoliticaCliente = z.object({ timeoutMs: z.number().int().positive(), retry: PoliticaRetry }).strict()
export type PoliticaCliente = z.infer<typeof PoliticaCliente>

export const POLITICA_WHATS: PoliticaCliente = {
  timeoutMs: 10_000,
  retry: { maxTentativas: 4, baseMs: 1_000, fator: 2, maxMs: 30_000, jitter: 0.2 },
}
export const POLITICA_LLM: PoliticaCliente = {
  timeoutMs: 60_000,
  retry: { maxTentativas: 3, baseMs: 1_500, fator: 2, maxMs: 20_000, jitter: 0.2 },
}
export const POLITICA_MAPAS: PoliticaCliente = {
  timeoutMs: 8_000,
  retry: { maxTentativas: 3, baseMs: 500, fator: 2, maxMs: 5_000, jitter: 0.2 },
}

/** Atraso (ms) antes da tentativa seguinte. `tentativa` comeca em 1 (a que acabou de falhar). */
export function atrasoRetry(p: PoliticaRetry, tentativa: number, aleatorio: () => number = Math.random): number {
  const bruto = Math.min(p.maxMs, p.baseMs * p.fator ** (tentativa - 1))
  return Math.round(bruto * (1 + p.jitter * aleatorio()))
}

/** Decide retry: erro retentavel e ainda ha tentativas. RateLimit com retryAposMs prevalece. */
export function proximoRetry(
  p: PoliticaRetry,
  erro: ErroProvedor,
  tentativa: number,
  aleatorio?: () => number,
): { tentar: boolean; atrasoMs: number } {
  if (!erro.retentavel || tentativa >= p.maxTentativas) return { tentar: false, atrasoMs: 0 }
  const sugerido = erro instanceof RateLimit ? erro.retryAposMs : undefined
  return { tentar: true, atrasoMs: sugerido ?? atrasoRetry(p, tentativa, aleatorio) }
}

/**
 * Host permitido de um cliente: nome exato ("graph.facebook.com") ou sufixo com curinga
 * ("*.openrouter.ai", que NAO casa o dominio nu).
 */
export type HostPermitido = string

export function hostPermitido(host: string, permitidos: readonly HostPermitido[]): boolean {
  const h = host.toLowerCase()
  return permitidos.some((p) => {
    const pl = p.toLowerCase()
    return pl.startsWith('*.') ? h.endsWith(pl.slice(1)) && h.length > pl.length - 1 : h === pl
  })
}

/**
 * Credencial opaca: carrega o segredo sem deixa-lo vazar por serializacao, log ou template
 * string. So `revelar()` (usado no header de auth da implementacao) devolve o valor (SEC-026).
 */
export class CredencialResolvida {
  readonly #segredo: string
  constructor(segredo: string) {
    this.#segredo = segredo
  }
  revelar(): string {
    return this.#segredo
  }
  toJSON(): string {
    return '[credencial]'
  }
  toString(): string {
    return '[credencial]'
  }
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return 'CredencialResolvida{[oculta]}'
  }
}
export const CredencialResolvidaSchema = z.instanceof(CredencialResolvida)
