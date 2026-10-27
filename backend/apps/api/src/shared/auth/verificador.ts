// Verificacao LOCAL do JWT por JWKS (F3, etapa 3). Nenhuma chamada ao emissor no
// caminho da requisicao alem do refresh do JWKS, que a propria `jose` cacheia (TTL) e
// faz rate-limit no refetch por `kid` desconhecido (cooldown), para nao virar DoS.
//
// Postura ADVERSARIAL:
//   - allowlist de algoritmos ASSIMETRICOS; `none` e qualquer HS* sao recusados pela
//     `jose` ao validar contra a allowlist (fecha algorithm-confusion).
//   - valida assinatura, exp, nbf, iss, aud e exige `sub`.
//   - FALHA FECHADA: qualquer erro (JWKS fora do ar, kid desconhecido, claim errado,
//     assinatura trocada, token expirado) vira recusa; nunca "passa na duvida".
//   - o token NUNCA e logado nem embutido em mensagem de erro.
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

/** Allowlist padrao: so assimetricos. Jamais inclua HS* ou `none` aqui. */
export const ALGORITMOS_PADRAO = ['ES256', 'RS256'] as const

export class ErroJwt extends Error {
  constructor(public readonly motivo: string) {
    super('jwt invalido')
    this.name = 'ErroJwt'
  }
}

export interface OpcoesVerificador {
  issuer: string
  audience: string
  /** Resolver de chave: remoto (`createRemoteJWKSet`) em producao, local em teste. */
  jwks: JWTVerifyGetKey
  /** Allowlist de algoritmos; default so assimetricos (ES256/RS256). */
  algoritmos?: readonly string[]
  /** Tolerancia de relogio em segundos (default 5s). */
  toleranciaRelogioSeg?: number
}

export interface Verificador {
  /** Resolve o `sub` de um token valido; lanca `ErroJwt` em qualquer falha. */
  verificar(token: string): Promise<{ sub: string }>
}

export function criarVerificador(opcoes: OpcoesVerificador): Verificador {
  const algoritmos = [...(opcoes.algoritmos ?? ALGORITMOS_PADRAO)]
  // Barreira defensiva: ainda que o chamador passe uma allowlist custom, recusamos
  // simetricos e `none` na construcao (nunca em runtime, onde seria tarde).
  for (const alg of algoritmos) {
    if (alg === 'none' || alg.startsWith('HS')) {
      throw new Error(`algoritmo proibido na allowlist de JWT: ${alg}`)
    }
  }
  const clockTolerance = opcoes.toleranciaRelogioSeg ?? 5

  return {
    async verificar(token) {
      if (!token) throw new ErroJwt('token ausente')
      try {
        const { payload } = await jwtVerify(token, opcoes.jwks, {
          issuer: opcoes.issuer,
          audience: opcoes.audience,
          algorithms: algoritmos,
          clockTolerance,
          requiredClaims: ['sub'],
        })
        const sub = payload.sub
        if (typeof sub !== 'string' || sub.length === 0) {
          throw new ErroJwt('sub ausente')
        }
        return { sub }
      } catch (erro) {
        if (erro instanceof ErroJwt) throw erro
        // Nunca propaga o objeto original (pode carregar o token/claims); so o motivo.
        const motivo = erro instanceof Error ? erro.name : 'desconhecido'
        throw new ErroJwt(motivo)
      }
    },
  }
}

export interface OpcoesVerificadorSupabase {
  supabaseUrl: string
  /** TTL do cache do JWKS (ms). Default 10 min. */
  cacheMaxAgeMs?: number
  /** Cooldown minimo entre refetch do JWKS (ms), anti-DoS. Default 30s. */
  cooldownMs?: number
  /** Timeout da busca do JWKS (ms). Default 5s. */
  timeoutMs?: number
  audience?: string
  algoritmos?: readonly string[]
}

/**
 * Verificador de producao contra o GoTrue do Supabase (emissor OIDC substituivel:
 * basta trocar a URL). A `jose` cuida do cache (cacheMaxAge), do rate-limit de refetch
 * por kid desconhecido (cooldownDuration) e do timeout.
 */
export function criarVerificadorSupabase(opcoes: OpcoesVerificadorSupabase): Verificador {
  const base = opcoes.supabaseUrl.replace(/\/$/, '')
  const issuer = `${base}/auth/v1`
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
    cacheMaxAge: opcoes.cacheMaxAgeMs ?? 10 * 60_000,
    cooldownDuration: opcoes.cooldownMs ?? 30_000,
    timeoutDuration: opcoes.timeoutMs ?? 5_000,
  })
  return criarVerificador({
    issuer,
    // Supabase emite tokens de usuario com aud=authenticated.
    audience: opcoes.audience ?? 'authenticated',
    jwks,
    algoritmos: opcoes.algoritmos,
  })
}
