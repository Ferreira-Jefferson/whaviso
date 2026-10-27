// Atores de teste para a varredura de respostas (SEC-020) e demais testes de borda HTTP. Emite
// JWTs assinados por um par de chaves RS256 LOCAL (jose), sem depender do Supabase. O verificador
// local tem a MESMA forma do verificador de producao (Verificador: resolve `sub`), entao pode ser
// injetado no autenticarPlugin do F4 em teste. Tokens ganham exp/nbf controlaveis para exercitar
// expiracao, nbf no futuro e assinatura trocada.
import { generateKeyPair, SignJWT, jwtVerify } from 'jose'

/** Tipo da chave produzida pelo jose nesta versao (CryptoKey/KeyObject), sem depender de KeyLike. */
type Chave = Awaited<ReturnType<typeof generateKeyPair>>['privateKey']

const ALG = 'RS256'
const ISS = 'https://teste.local/auth'
const AUD = 'whaviso-teste'

export interface Verificador {
  verificar(token: string): Promise<{ sub: string }>
}

export interface OpcoesToken {
  sub: string
  /** Segundos a partir de agora ate expirar (default 3600; negativo = ja expirado). */
  expiraEmSeg?: number
  /** Segundos a partir de agora ate ficar valido (default 0; positivo = nbf no futuro). */
  validoAPartirSeg?: number
}

export interface AtoresLocais {
  verificador: Verificador
  /** Assina um token com a chave local correta. */
  mint(opcoes: OpcoesToken | string): Promise<string>
  /** Assina com uma chave DIFERENTE (assinatura invalida para o verificador). */
  mintAssinaturaErrada(sub: string): Promise<string>
  /** Subs nomeados: duas lojas distintas, um operador. O anonimo e a ausencia de token. */
  subs: { membroA: string; membroB: string; operador: string }
}

export async function criarAtoresLocais(): Promise<AtoresLocais> {
  const { publicKey, privateKey } = await generateKeyPair(ALG)
  const outro = await generateKeyPair(ALG)

  async function assinar(chave: Chave, o: OpcoesToken): Promise<string> {
    const agora = Math.floor(Date.now() / 1000)
    return new SignJWT({})
      .setProtectedHeader({ alg: ALG })
      .setSubject(o.sub)
      .setIssuer(ISS)
      .setAudience(AUD)
      .setIssuedAt(agora)
      .setNotBefore(agora + (o.validoAPartirSeg ?? 0))
      .setExpirationTime(agora + (o.expiraEmSeg ?? 3600))
      .sign(chave)
  }

  const verificador: Verificador = {
    async verificar(token: string) {
      const { payload } = await jwtVerify(token, publicKey, {
        algorithms: [ALG],
        issuer: ISS,
        audience: AUD,
        requiredClaims: ['sub'],
      })
      if (typeof payload.sub !== 'string' || payload.sub.length === 0) throw new Error('sub ausente')
      return { sub: payload.sub }
    },
  }

  return {
    verificador,
    mint: (o) => assinar(privateKey, typeof o === 'string' ? { sub: o } : o),
    mintAssinaturaErrada: (sub) => assinar(outro.privateKey, { sub }),
    subs: {
      membroA: '11111111-1111-1111-1111-111111111111',
      membroB: '22222222-2222-2222-2222-222222222222',
      operador: '33333333-3333-3333-3333-333333333333',
    },
  }
}
